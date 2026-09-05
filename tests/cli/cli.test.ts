import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { BrowserProbeProvider } from "@tariff-radar/probe-core";
import type { WorkflowResult } from "@tariff-radar/probe-core";
import { noopProbeLogger } from "@tariff-radar/probe-core";
import type { Seed } from "@tariff-radar/registry";
import type { ProbeWorkflowOptions } from "@tariff-radar/workflow";
import {
  defaultDeps,
  findSeed,
  formatSummary,
  loadSeeds,
  parseArgs,
  runTargets,
  HelpRequested,
} from "../../packages/cli/src/index.js";
import type { RunDeps } from "../../packages/cli/src/index.js";

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

interface RecordedCall {
  isoCode: string;
  provider: unknown;
  timeoutMs: unknown;
  browserOptions: unknown;
}

function stubDeps(
  results: WorkflowResult[],
  opts: { apiKey?: string } = {},
): {
  deps: RunDeps;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const fakeProvider: BrowserProbeProvider = {
    name: "fake",
    launch: async () => {
      throw new Error("unused");
    },
  };
  let index = 0;
  const deps: RunDeps = {
    runWorkflow: (async (seed: Seed, options?: ProbeWorkflowOptions) => {
      calls.push({
        isoCode: seed.isoCode,
        provider: options?.browserProvider,
        timeoutMs: options?.timeoutMs,
        browserOptions: options?.browserOptions,
      });
      return results[index++];
    }) as RunDeps["runWorkflow"],
    createSolariProvider: () => fakeProvider,
    readApiKey: () => ("apiKey" in opts ? opts.apiKey : "test-key"),
    logger: noopProbeLogger,
  };
  return { deps, calls };
}

describe("parseArgs", () => {
  it("accepts one ISO code direct-only by default", () => {
    expect(parseArgs(["us"])).toEqual({ target: "US", all: false, browser: null });
  });

  it("accepts --all without a positional", () => {
    expect(parseArgs(["--all"])).toMatchObject({ target: "all", all: true });
  });

  it("accepts browser, timeout, and opt-in provider flags", () => {
    expect(
      parseArgs(["US", "--browser=solari", "--timeout-ms=2500", "--stealth", "--proxy-country=mx", "--captcha"]),
    ).toEqual({
      target: "US",
      all: false,
      browser: "solari",
      timeoutMs: 2500,
      stealth: true,
      proxyCountry: "MX",
      captcha: true,
    });
  });

  it("rejects a missing target", () => {
    expect(() => parseArgs([])).toThrow("Missing target ISO code.");
  });

  it("rejects an ISO combined with --all", () => {
    expect(() => parseArgs(["US", "--all"])).toThrow("either an ISO code or --all");
  });

  it("rejects unknown browser providers", () => {
    expect(() => parseArgs(["US", "--browser=other"])).toThrow('Argument: browser, Given: "other"');
  });

  it("rejects invalid timeout values", () => {
    expect(() => parseArgs(["US", "--timeout-ms=0"])).toThrow("Invalid --timeout-ms value.");
    expect(() => parseArgs(["US", "--timeout-ms=nope"])).toThrow("Invalid --timeout-ms value.");
    expect(() => parseArgs(["US", "--timeout-ms=1.5"])).toThrow("Invalid --timeout-ms value.");
  });

  it("rejects invalid proxy countries", () => {
    expect(() => parseArgs(["US", "--proxy-country=MEX"])).toThrow("Invalid --proxy-country value.");
    expect(() => parseArgs(["US", "--proxy-country="])).toThrow("Invalid --proxy-country value.");
  });

  it("rejects unknown flags and extra positionals", () => {
    expect(() => parseArgs(["US", "--nope"])).toThrow("Unknown argument: nope");
    expect(() => parseArgs(["US", "MX"])).toThrow("Unknown argument: MX");
  });

  it("requests help instead of options for --help", () => {
    expect(() => parseArgs(["--help"])).toThrow(HelpRequested);
  });
});

describe("findSeed and loadSeeds", () => {
  it("matches ISO codes case-insensitively", () => {
    expect(findSeed([seedUS, seedMX], "mx")).toBe(seedMX);
  });

  it("throws for unknown ISO codes", () => {
    expect(() => findSeed([seedUS], "ZZ")).toThrow('Unknown ISO code "ZZ".');
  });

  it("loads seeds from a JSON file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
    try {
      const path = join(dir, "seeds.json");
      writeFileSync(path, JSON.stringify([seedUS, seedMX]));
      await expect(loadSeeds(path)).resolves.toEqual([seedUS, seedMX]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("formatSummary", () => {
  it("summarizes a direct success", () => {
    const text = formatSummary(workflowResult({ seed: seedUS }));
    expect(text).toContain("US United States <https://hts.usitc.gov/>");
    expect(text).toContain("method: direct");
    expect(text).toContain("direct: HTTP 200 in 42ms");
    expect(text).toContain("evidence: direct_response");
  });

  it("summarizes a browser fallback with provider and title", () => {
    const text = formatSummary(
      workflowResult({
        seed: seedMX,
        method: "browser",
        provider: "solari",
        direct: directFailed("connection refused"),
        browser: { status: 200, finalUrl: "https://www.snice.gob.mx/final", title: "SNICE", text: "arancel" },
        evidence: ["browser_response", "browser_text"],
      }),
    );
    expect(text).toContain("method: browser provider: solari");
    expect(text).toContain("direct: failed (connection refused)");
    expect(text).toContain("browser: HTTP 200 at https://www.snice.gob.mx/final");
    expect(text).toContain("title: SNICE");
  });

  it("summarizes a failure without browser or evidence", () => {
    const text = formatSummary(
      workflowResult({
        seed: seedUS,
        method: "failed",
        direct: directFailed(null),
        evidence: [],
        error: "direct probe failed and no browser provider was configured",
      }),
    );
    expect(text).toContain("direct: failed (unknown error)");
    expect(text).toContain("evidence: none");
    expect(text).toContain("error: direct probe failed");
  });

  it("summarizes a browser run with no observed response", () => {
    const text = formatSummary(
      workflowResult({
        seed: seedUS,
        method: "browser",
        provider: "solari",
        direct: directFailed("timeout"),
        browser: { status: null, finalUrl: null, title: null, text: "body" },
        evidence: ["browser_text"],
      }),
    );
    expect(text).toContain("browser: no response at unknown url");
    expect(text).not.toContain("title:");
  });
});

describe("runTargets", () => {
  it("probes one seed direct-only by default", async () => {
    const expected = workflowResult({ seed: seedUS });
    const { deps, calls } = stubDeps([expected]);
    const results = await runTargets([seedUS, seedMX], parseArgs(["us"]), deps);
    expect(results).toEqual([expected]);
    expect(calls).toEqual([
      {
        isoCode: "US",
        provider: undefined,
        timeoutMs: undefined,
        browserOptions: { stealth: undefined, proxyCountry: undefined, captcha: undefined },
      },
    ]);
  });

  it("builds the Solari provider and forwards flags when requested", async () => {
    const expected = workflowResult({ seed: seedUS, method: "browser", provider: "fake" });
    const { deps, calls } = stubDeps([expected]);
    const results = await runTargets(
      [seedUS],
      parseArgs(["US", "--browser=solari", "--timeout-ms=2500", "--stealth", "--proxy-country=mx", "--captcha"]),
      deps,
    );
    expect(results).toEqual([expected]);
    expect(calls[0]?.provider).toMatchObject({ name: "fake" });
    expect(calls[0]?.timeoutMs).toBe(2500);
    expect(calls[0]?.browserOptions).toEqual({ stealth: true, proxyCountry: "MX", captcha: true });
  });

  it("throws when the Solari key is missing", async () => {
    const { deps } = stubDeps([], { apiKey: undefined });
    await expect(runTargets([seedUS], parseArgs(["US", "--browser=solari"]), deps)).rejects.toThrow(
      "SOLARI_API_KEY is not set.",
    );
  });

  it("probes every seed with --all in file order", async () => {
    const first = workflowResult({ seed: seedUS });
    const second = workflowResult({ seed: seedMX });
    const { deps, calls } = stubDeps([first, second]);
    const results = await runTargets([seedUS, seedMX], parseArgs(["--all"]), deps);
    expect(results).toEqual([first, second]);
    expect(calls.map((call) => call.isoCode)).toEqual(["US", "MX"]);
  });

  it("throws for unknown ISO codes", async () => {
    const { deps } = stubDeps([]);
    await expect(runTargets([seedUS], parseArgs(["ZZ"]), deps)).rejects.toThrow('Unknown ISO code "ZZ".');
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
