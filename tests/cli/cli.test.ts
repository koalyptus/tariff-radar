import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { BrowserProbeProvider } from "@tariff-radar/probe-core";
import type { ProbeLogger, WorkflowResult } from "@tariff-radar/probe-core";
import { PROBE_LOG_EVENT, noopProbeLogger } from "@tariff-radar/probe-core";
import type { Seed } from "@tariff-radar/registry";
import type { ProbeWorkflowOptions } from "@tariff-radar/workflow";
import {
  defaultDeps,
  findSeed,
  formatTable,
  loadSeeds,
  parseProbeArgs,
  runTargets,
  HelpRequested,
} from "@tariff-radar/cli";
import type { RunDeps } from "@tariff-radar/cli";

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
  opts: { apiKey?: string; logger?: ProbeLogger } = {},
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
      options?.logger?.info("probe", { isoCode: seed.isoCode });
      return results[index++];
    }) as RunDeps["runWorkflow"],
    createSolariProvider: () => fakeProvider,
    readApiKey: () => ("apiKey" in opts ? opts.apiKey : "test-key"),
    logger: opts.logger ?? noopProbeLogger,
  };
  return { deps, calls };
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

describe("runTargets", () => {
  it("builds the default Solari provider", async () => {
    const expected = workflowResult({ seed: seedUS });
    const { deps, calls } = stubDeps([expected]);
    const results = await runTargets([seedUS, seedMX], parseProbeArgs(["us"]), deps);
    expect(results).toEqual([expected]);
    expect(calls).toEqual([
      {
        isoCode: "US",
        provider: calls[0]?.provider,
        timeoutMs: undefined,
        browserOptions: { stealth: undefined, proxyCountry: undefined, captcha: undefined },
      },
    ]);
    expect(calls[0]?.provider).toMatchObject({ name: "fake" });
  });

  it("builds the Solari provider and forwards flags when requested", async () => {
    const expected = workflowResult({ seed: seedUS, method: "browser", provider: "fake" });
    const { deps, calls } = stubDeps([expected]);
    const results = await runTargets(
      [seedUS],
      parseProbeArgs(["US", "--browser=solari", "--timeout-ms=2500", "--stealth", "--proxy-country=mx", "--captcha"]),
      deps,
    );
    expect(results).toEqual([expected]);
    expect(calls[0]?.provider).toMatchObject({ name: "fake" });
    expect(calls[0]?.timeoutMs).toBe(2500);
    expect(calls[0]?.browserOptions).toEqual({ stealth: true, proxyCountry: "MX", captcha: true });
  });

  it("throws when the Solari key is missing", async () => {
    const { deps } = stubDeps([], { apiKey: undefined });
    await expect(runTargets([seedUS], parseProbeArgs(["US", "--browser=solari"]), deps)).rejects.toThrow(
      "SOLARI_API_KEY is not set.",
    );
  });

  it("warns and continues direct-only when the default browser lacks a key", async () => {
    const expected = workflowResult({ seed: seedUS });
    const warnings: string[] = [];
    const { deps, calls } = stubDeps([expected], {
      apiKey: undefined,
      logger: { debug: () => {}, info: () => {}, warn: (message) => warnings.push(message), error: () => {} },
    });
    const results = await runTargets([seedUS], parseProbeArgs(["US"]), deps);
    expect(results).toEqual([expected]);
    expect(calls[0]?.provider).toBeUndefined();
    expect(warnings).toEqual(["SOLARI_API_KEY is not set — continuing direct-only."]);
  });

  it("skips the browser entirely with --browser=direct", async () => {
    const expected = workflowResult({ seed: seedUS });
    const { deps, calls } = stubDeps([expected]);
    const results = await runTargets([seedUS], parseProbeArgs(["US", "--browser=direct"]), deps);
    expect(results).toEqual([expected]);
    expect(calls[0]?.provider).toBeUndefined();
  });

  it("probes every seed without an ISO in file order", async () => {
    const first = workflowResult({ seed: seedUS });
    const second = workflowResult({ seed: seedMX });
    const { deps, calls } = stubDeps([first, second]);
    const results = await runTargets([seedUS, seedMX], parseProbeArgs([]), deps);
    expect(results).toEqual([first, second]);
    expect(calls.map((call) => call.isoCode)).toEqual(["US", "MX"]);
  });

  it("runs up to concurrency probes at once, keeping seed order", async () => {
    const first = workflowResult({ seed: seedUS });
    const second = workflowResult({ seed: seedMX });
    let inFlight = 0;
    let maxInFlight = 0;
    const runWorkflow = (async (seed: Seed) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return seed.isoCode === "US" ? first : second;
    }) as RunDeps["runWorkflow"];
    const fakeProvider: BrowserProbeProvider = {
      name: "fake",
      launch: async () => {
        throw new Error("unused");
      },
    };
    const deps: RunDeps = {
      runWorkflow,
      createSolariProvider: () => fakeProvider,
      readApiKey: () => "test-key",
      logger: noopProbeLogger,
    };
    const results = await runTargets([seedUS, seedMX], { ...parseProbeArgs([]), concurrency: 2 }, deps);
    expect(maxInFlight).toBe(2);
    expect(results).toEqual([first, second]);
  });

  it("prints each seed's lines as one block in completion order", async () => {
    const first = workflowResult({ seed: seedUS });
    const second = workflowResult({ seed: seedMX });
    const lines: string[] = [];
    let releaseUS!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseUS = resolve;
    });
    const runWorkflow = (async (seed: Seed, options?: ProbeWorkflowOptions) => {
      options?.logger?.info(PROBE_LOG_EVENT.START, { isoCode: seed.isoCode });
      if (seed.isoCode === "US") {
        await gate;
      }
      options?.logger?.info(`end-${seed.isoCode}`);
      return seed.isoCode === "US" ? first : second;
    }) as RunDeps["runWorkflow"];
    const deps: RunDeps = {
      runWorkflow,
      createSolariProvider: () => ({
        name: "fake",
        launch: async () => {
          throw new Error("unused");
        },
      }),
      readApiKey: () => "test-key",
      logger: {
        debug: () => {},
        info: (message: string) => {
          lines.push(message);
        },
        warn: () => {},
        error: () => {},
      },
    };
    const pending = runTargets([seedUS, seedMX], { ...parseProbeArgs([]), concurrency: 2 }, deps);
    await new Promise((resolve) => setImmediate(resolve));
    releaseUS();
    const results = await pending;
    expect(results).toEqual([first, second]);
    expect(lines).toEqual([PROBE_LOG_EVENT.START, "end-MX", PROBE_LOG_EVENT.START, "end-US"]);
  });

  it("throws for unknown ISO codes", async () => {
    const { deps } = stubDeps([]);
    await expect(runTargets([seedUS], parseProbeArgs(["ZZ"]), deps)).rejects.toThrow('Unknown ISO code "ZZ".');
  });

  it("forwards every log level through the buffer", async () => {
    const expected = workflowResult({ seed: seedUS });
    const forwarded: Array<{ level: string; message: string }> = [];
    const runWorkflow = (async (_seed: Seed, options?: ProbeWorkflowOptions) => {
      options?.logger?.debug("d");
      options?.logger?.info("i");
      options?.logger?.warn("w");
      options?.logger?.error("e");
      return expected;
    }) as RunDeps["runWorkflow"];
    const deps: RunDeps = {
      runWorkflow,
      createSolariProvider: () => {
        throw new Error("unused");
      },
      readApiKey: () => undefined,
      logger: {
        debug: (message: string) => {
          forwarded.push({ level: "debug", message });
        },
        info: (message: string) => {
          forwarded.push({ level: "info", message });
        },
        warn: (message: string) => {
          forwarded.push({ level: "warn", message });
        },
        error: (message: string) => {
          forwarded.push({ level: "error", message });
        },
      },
    };
    const results = await runTargets([seedUS], parseProbeArgs(["US", "--browser=direct"]), deps);
    expect(results).toEqual([expected]);
    expect(forwarded).toEqual([
      { level: "debug", message: "d" },
      { level: "info", message: "i" },
      { level: "warn", message: "w" },
      { level: "error", message: "e" },
    ]);
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
