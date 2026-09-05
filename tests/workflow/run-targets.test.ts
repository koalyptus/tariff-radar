import { describe, expect, it } from "vitest";
import type { BrowserProbeProvider, ProbeLogger, WorkflowResult } from "@tariff-radar/probe-core";
import { PROBE_LOG_EVENT, noopProbeLogger } from "@tariff-radar/probe-core";
import { runTargets } from "@tariff-radar/workflow";
import type { ProbeWorkflowOptions, RunDeps, WorkflowSeed } from "@tariff-radar/workflow";

const seedUS: WorkflowSeed = {
  isoCode: "US",
  countryName: "United States",
  portalUrl: "https://hts.usitc.gov/",
  sourceUrl: "https://www.usitc.gov/tariff_affairs",
};

const seedMX: WorkflowSeed = {
  isoCode: "MX",
  countryName: "Mexico",
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
    runWorkflow: (async (seed: WorkflowSeed, options?: ProbeWorkflowOptions) => {
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
    logger: opts.logger ?? noopProbeLogger,
  };
  return { deps, calls };
}

describe("runTargets", () => {
  it("builds the default Solari provider", async () => {
    const expected = workflowResult({ seed: seedUS });
    const { deps, calls } = stubDeps([expected]);
    const results = await runTargets([seedUS, seedMX], { target: "US", all: false, browser: null }, deps);
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

  it("matches ISO codes case-insensitively", async () => {
    const expected = workflowResult({ seed: seedUS });
    const { deps, calls } = stubDeps([expected]);
    const results = await runTargets([seedUS, seedMX], { target: "us", all: false, browser: null }, deps);
    expect(results).toEqual([expected]);
    expect(calls.map((call) => call.isoCode)).toEqual(["US"]);
  });

  it("builds the Solari provider and forwards flags when requested", async () => {
    const expected = workflowResult({ seed: seedUS, method: "browser", provider: "fake" });
    const { deps, calls } = stubDeps([expected]);
    const results = await runTargets(
      [seedUS],
      {
        target: "US",
        all: false,
        browser: "solari",
        timeoutMs: 2500,
        stealth: true,
        proxyCountry: "MX",
        captcha: true,
      },
      deps,
    );
    expect(results).toEqual([expected]);
    expect(calls[0]?.provider).toMatchObject({ name: "fake" });
    expect(calls[0]?.timeoutMs).toBe(2500);
    expect(calls[0]?.browserOptions).toEqual({ stealth: true, proxyCountry: "MX", captcha: true });
  });

  it("throws when the Solari key is missing", async () => {
    const { deps } = stubDeps([], { apiKey: undefined });
    await expect(runTargets([seedUS], { target: "US", all: false, browser: "solari" }, deps)).rejects.toThrow(
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
    const results = await runTargets([seedUS], { target: "US", all: false, browser: null }, deps);
    expect(results).toEqual([expected]);
    expect(calls[0]?.provider).toBeUndefined();
    expect(warnings).toEqual(["SOLARI_API_KEY is not set — continuing direct-only."]);
  });

  it("skips the browser entirely for direct mode", async () => {
    const expected = workflowResult({ seed: seedUS });
    const { deps, calls } = stubDeps([expected]);
    const results = await runTargets([seedUS], { target: "US", all: false, browser: "direct" }, deps);
    expect(results).toEqual([expected]);
    expect(calls[0]?.provider).toBeUndefined();
  });

  it("probes every seed in file order", async () => {
    const first = workflowResult({ seed: seedUS });
    const second = workflowResult({ seed: seedMX });
    const { deps, calls } = stubDeps([first, second]);
    const results = await runTargets([seedUS, seedMX], { target: "all", all: true, browser: null }, deps);
    expect(results).toEqual([first, second]);
    expect(calls.map((call) => call.isoCode)).toEqual(["US", "MX"]);
  });

  it("runs up to concurrency probes at once, keeping seed order", async () => {
    const first = workflowResult({ seed: seedUS });
    const second = workflowResult({ seed: seedMX });
    let inFlight = 0;
    let maxInFlight = 0;
    const runWorkflow = (async (seed: WorkflowSeed) => {
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
    const results = await runTargets(
      [seedUS, seedMX],
      { target: "all", all: true, browser: null, concurrency: 2 },
      deps,
    );
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
    const runWorkflow = (async (seed: WorkflowSeed, options?: ProbeWorkflowOptions) => {
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
    const pending = runTargets([seedUS, seedMX], { target: "all", all: true, browser: null, concurrency: 2 }, deps);
    await new Promise((resolve) => setImmediate(resolve));
    releaseUS();
    const results = await pending;
    expect(results).toEqual([first, second]);
    expect(lines).toEqual([PROBE_LOG_EVENT.START, "end-MX", PROBE_LOG_EVENT.START, "end-US"]);
  });

  it("throws for unknown ISO codes", async () => {
    const { deps } = stubDeps([]);
    await expect(runTargets([seedUS], { target: "ZZ", all: false, browser: null }, deps)).rejects.toThrow(
      'Unknown ISO code "ZZ".',
    );
  });

  it("forwards every log level through the buffer", async () => {
    const expected = workflowResult({ seed: seedUS });
    const forwarded: Array<{ level: string; message: string }> = [];
    const runWorkflow = (async (_seed: WorkflowSeed, options?: ProbeWorkflowOptions) => {
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
    const results = await runTargets([seedUS], { target: "US", all: false, browser: "direct" }, deps);
    expect(results).toEqual([expected]);
    expect(forwarded).toEqual([
      { level: "debug", message: "d" },
      { level: "info", message: "i" },
      { level: "warn", message: "w" },
      { level: "error", message: "e" },
    ]);
  });
});
