import { describe, expect, it } from "vitest";
import type { WorkflowResult } from "@tariff-radar/probe-core";
import type { Seed } from "@tariff-radar/registry";
import { defaultDeps, formatTable, parseProbeArgs, HelpRequested } from "@tariff-radar/cli";

const seedUS: Seed = {
  isoCode: "US",
  countryName: "United States",
  authority: "USITC",
  portalUrl: "https://hts.usitc.gov/",
  sourceUrl: "https://www.usitc.gov/tariff_affairs",
};

const seedMX: Seed = {
  isoCode: "MX",
  countryName: "Mexico",
  authority: "Secretaria de Economia",
  portalUrl: "https://www.snice.gob.mx/",
  sourceUrl: "https://www.gob.mx/se/snice",
};

function directOk() {
  return {
    ok: true,
    status: 200,
    finalUrl: "https://hts.usitc.gov/",
    latencyMs: 42,
    title: null,
    error: null,
  };
}

function directFailed(error: string | null) {
  return { ok: false, status: null, finalUrl: null, latencyMs: 7, title: null, error };
}

function workflowResult(partial: Partial<WorkflowResult> & { seed: WorkflowResult["seed"] }): WorkflowResult {
  return {
    method: "direct",
    provider: null,
    direct: directOk(),
    browser: null,
    evidence: ["direct_response"],
    error: null,
    ...partial,
  };
}

describe("parseProbeArgs", () => {
  it("accepts one ISO code direct-only by default", () => {
    expect(parseProbeArgs(["us"])).toEqual({ target: "US", all: false, browser: null, log: "pretty" });
  });

  it("probes all seeds when no ISO is given", () => {
    expect(parseProbeArgs([])).toEqual({ target: "all", all: true, browser: null, log: "pretty" });
  });

  it("accepts browser, timeout, and opt-in provider flags", () => {
    expect(
      parseProbeArgs(["US", "--browser=solari", "--timeout-ms=2500", "--stealth", "--proxy-country=mx", "--captcha"]),
    ).toEqual({
      target: "US",
      all: false,
      browser: "solari",
      timeoutMs: 2500,
      stealth: true,
      proxyCountry: "MX",
      captcha: true,
      log: "pretty",
    });
  });

  it("accepts JSON log rendering", () => {
    expect(parseProbeArgs(["US", "--log=json"])).toMatchObject({ log: "json" });
  });

  it("rejects unknown log renderers", () => {
    expect(() => parseProbeArgs(["US", "--log=yaml"])).toThrow('Argument: log, Given: "yaml"');
  });

  it("accepts a concurrency limit", () => {
    expect(parseProbeArgs(["--concurrency=3"])).toMatchObject({ target: "all", all: true, concurrency: 3 });
  });

  it("rejects invalid concurrency values", () => {
    expect(() => parseProbeArgs(["US", "--concurrency=0"])).toThrow("Invalid --concurrency value (1-8).");
    expect(() => parseProbeArgs(["US", "--concurrency=nope"])).toThrow("Invalid --concurrency value (1-8).");
    expect(() => parseProbeArgs(["US", "--concurrency=1.5"])).toThrow("Invalid --concurrency value (1-8).");
    expect(() => parseProbeArgs(["US", "--concurrency=9"])).toThrow("Invalid --concurrency value (1-8).");
  });

  it("accepts the maximum concurrency", () => {
    expect(parseProbeArgs(["--concurrency=8"])).toMatchObject({ concurrency: 8 });
  });

  it("rejects a removed --all flag", () => {
    expect(() => parseProbeArgs(["--all"])).toThrow("Unknown argument: all");
  });

  it("rejects unknown browser providers", () => {
    expect(() => parseProbeArgs(["US", "--browser=other"])).toThrow('Argument: browser, Given: "other"');
  });

  it("accepts direct to disable the browser fallback", () => {
    expect(parseProbeArgs(["US", "--browser=direct"])).toMatchObject({ browser: "direct" });
  });

  it("rejects invalid timeout values", () => {
    expect(() => parseProbeArgs(["US", "--timeout-ms=0"])).toThrow("Invalid --timeout-ms value.");
    expect(() => parseProbeArgs(["US", "--timeout-ms=nope"])).toThrow("Invalid --timeout-ms value.");
    expect(() => parseProbeArgs(["US", "--timeout-ms=1.5"])).toThrow("Invalid --timeout-ms value.");
  });

  it("rejects invalid proxy countries", () => {
    expect(() => parseProbeArgs(["US", "--proxy-country=MEX"])).toThrow("Invalid --proxy-country value.");
    expect(() => parseProbeArgs(["US", "--proxy-country="])).toThrow("Invalid --proxy-country value.");
  });

  it("rejects unknown flags and extra positionals", () => {
    expect(() => parseProbeArgs(["US", "--nope"])).toThrow("Unknown argument: nope");
    expect(() => parseProbeArgs(["US", "MX"])).toThrow("Unknown argument: MX");
  });

  it("requests help instead of options for --help", () => {
    expect(() => parseProbeArgs(["--help"])).toThrow(HelpRequested);
  });
});

describe("formatTable", () => {
  it("renders one row per seed with error details", () => {
    const text = formatTable([
      workflowResult({ seed: seedUS }),
      workflowResult({
        seed: seedMX,
        method: "browser",
        provider: "solari",
        direct: directFailed("connection refused"),
        browser: {
          status: 200,
          finalUrl: "https://www.snice.gob.mx/final",
          title: "SNICE",
          text: "arancel",
          latencyMs: 812,
        },
        evidence: ["browser_response", "browser_text"],
      }),
      workflowResult({
        seed: seedUS,
        method: "failed",
        direct: directFailed(null),
        evidence: [],
        error: "direct probe failed and no browser provider was configured",
      }),
    ]);
    for (const cell of [
      "ISO",
      "METHOD",
      "PROVIDER",
      "OUTCOME",
      "EVIDENCE",
      "US",
      "direct",
      "HTTP 200 in 42ms",
      "direct_response",
      "MX",
      "browser",
      "solari",
      "HTTP 200 in 812ms",
      "browser_response, browser_text",
      "failed",
      "none",
      "error: direct probe failed and no browser provider was configured",
    ]) {
      expect(text).toContain(cell);
    }
  });

  it("renders a browser run with no observed response", () => {
    const text = formatTable([
      workflowResult({
        seed: seedUS,
        method: "browser",
        provider: "solari",
        direct: directFailed("timeout"),
        browser: { status: null, finalUrl: null, title: null, text: "body", latencyMs: 96 },
        evidence: ["browser_text"],
      }),
    ]);
    expect(text).toContain("no response");
    expect(text).not.toContain("title:");
  });

  it("renders an unknown failure without a recorded error", () => {
    const text = formatTable([workflowResult({ seed: seedUS, method: "failed", direct: directFailed(null) })]);
    expect(text).toContain("unknown error");
  });
});

describe("defaultDeps", () => {
  it("reads SOLARI_API_KEY from the environment", () => {
    const saved = process.env.SOLARI_API_KEY;
    try {
      process.env.SOLARI_API_KEY = "env-key";
      expect(defaultDeps().readApiKey()).toBe("env-key");
      delete process.env.SOLARI_API_KEY;
      expect(defaultDeps().readApiKey()).toBeUndefined();
    } finally {
      if (saved === undefined) {
        delete process.env.SOLARI_API_KEY;
      } else {
        process.env.SOLARI_API_KEY = saved;
      }
    }
  });

  it("builds a Solari provider session without network access", async () => {
    const provider = defaultDeps().createSolariProvider("test-key");
    expect(provider.name).toBe("solari");
    const session = await provider.launch({ stealth: true, proxyCountry: "mx", captcha: true });
    await (await session.newPage()).close();
    await session.close();
  });
});
