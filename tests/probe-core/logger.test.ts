import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PROBE_LOG_EVENT,
  PROBE_METHOD,
  ProbeRunLogger,
  consoleProbeLogger,
  noopProbeLogger,
} from "@tariff-radar/probe-core";
import type { BrowserProbeProvider, LogFields, ProbeLogger } from "@tariff-radar/probe-core";
import { probeWorkflow } from "@tariff-radar/workflow";
import type { WorkflowSeed } from "@tariff-radar/workflow";

const seed: WorkflowSeed = {
  isoCode: "T1",
  countryName: "Testland",
  portalUrl: "https://portal.example/tariff",
  sourceUrl: "https://authority.example/",
};

interface RecordedCall {
  level: string;
  message: string;
  fields?: LogFields;
}

function createRecordingLogger(): { logger: ProbeLogger; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  return {
    calls,
    logger: {
      debug: (message: string, fields?: LogFields) => {
        calls.push({ level: "debug", message, fields });
      },
      info: (message: string, fields?: LogFields) => {
        calls.push({ level: "info", message, fields });
      },
      warn: (message: string, fields?: LogFields) => {
        calls.push({ level: "warn", message, fields });
      },
      error: (message: string, fields?: LogFields) => {
        calls.push({ level: "error", message, fields });
      },
    },
  };
}

function fetchFail() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("connection refused");
    }),
  );
}

function fetchOk() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, url: "https://portal.example/tariff" })),
  );
}

function fakeProvider(launchError?: unknown): BrowserProbeProvider {
  return {
    name: "fake",
    launch: async () => {
      if (launchError !== undefined) {
        throw launchError;
      }
      return {
        newPage: async () => ({
          goto: async () => ({ status: () => 200, url: () => "https://portal.example/final" }),
          title: async () => "Tariff portal",
          text: async () => "customs duty tariff secret-page-body",
          close: async () => {},
        }),
        close: async () => {},
      };
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("noopProbeLogger", () => {
  it("accepts every event schema without throwing", () => {
    expect(() => {
      noopProbeLogger.debug(PROBE_LOG_EVENT.START, { isoCode: "T1", portalUrl: seed.portalUrl });
      noopProbeLogger.info(PROBE_LOG_EVENT.DIRECT_COMPLETE, {
        isoCode: "T1",
        portalUrl: seed.portalUrl,
        ok: true,
        status: 200,
        finalUrl: seed.portalUrl,
        latencyMs: 1,
        error: null,
      });
      noopProbeLogger.warn(PROBE_LOG_EVENT.BROWSER_FALLBACK, {
        isoCode: "T1",
        portalUrl: seed.portalUrl,
        provider: "fake",
      });
      noopProbeLogger.error(PROBE_LOG_EVENT.FAILED, {
        isoCode: "T1",
        portalUrl: seed.portalUrl,
        provider: null,
        method: PROBE_METHOD.FAILED,
        error: "boom",
      });
    }).not.toThrow();
  });
});

describe("consoleProbeLogger", () => {
  it("writes one structured JSON line per level without secrets", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    consoleProbeLogger.debug(PROBE_LOG_EVENT.START, { isoCode: "T1", portalUrl: seed.portalUrl });
    consoleProbeLogger.info(PROBE_LOG_EVENT.DIRECT_COMPLETE, {
      isoCode: "T1",
      portalUrl: seed.portalUrl,
      ok: true,
      status: 200,
      finalUrl: seed.portalUrl,
      latencyMs: 3,
      error: null,
    });
    consoleProbeLogger.warn(PROBE_LOG_EVENT.BROWSER_FALLBACK, {
      isoCode: "T1",
      portalUrl: seed.portalUrl,
      provider: "fake",
    });
    consoleProbeLogger.error(PROBE_LOG_EVENT.FAILED, {
      isoCode: "T1",
      portalUrl: seed.portalUrl,
      provider: "fake",
      method: PROBE_METHOD.FAILED,
      error: "boom",
    });

    expect(debugSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);

    for (const spy of [debugSpy, infoSpy, warnSpy, errorSpy]) {
      const raw = String(spy.mock.calls[0]?.[0]);
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      expect(parsed["isoCode"]).toBe("T1");
      const serialized = JSON.stringify(parsed).toLowerCase();
      expect(serialized).not.toContain("apikey");
      expect(serialized).not.toContain("token");
    }
  });

  it("emits level, event, and fields as one JSON line", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    consoleProbeLogger.info(PROBE_LOG_EVENT.BROWSER_COMPLETE, {
      isoCode: "T1",
      portalUrl: seed.portalUrl,
      provider: "fake",
      status: 200,
      finalUrl: "https://portal.example/final",
    });
    expect(infoSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(String(infoSpy.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      level: "info",
      message: PROBE_LOG_EVENT.BROWSER_COMPLETE,
      isoCode: "T1",
      provider: "fake",
      status: 200,
    });
  });
});

describe("ProbeRunLogger", () => {
  it("emits every event with bound context and the specified level", () => {
    const { logger, calls } = createRecordingLogger();
    const log = new ProbeRunLogger(logger, seed);
    log.start();
    log.directComplete({
      ok: true,
      status: 200,
      finalUrl: seed.portalUrl,
      latencyMs: 3,
      title: null,
      error: null,
    });
    log.browserFallback("fake");
    log.browserComplete("fake", 200, "https://portal.example/final");
    log.failed("fake", "boom");
    expect(calls.map((call) => `${call.level}:${call.message}`)).toEqual([
      `info:${PROBE_LOG_EVENT.START}`,
      `info:${PROBE_LOG_EVENT.DIRECT_COMPLETE}`,
      `info:${PROBE_LOG_EVENT.BROWSER_FALLBACK}`,
      `info:${PROBE_LOG_EVENT.BROWSER_COMPLETE}`,
      `error:${PROBE_LOG_EVENT.FAILED}`,
    ]);
    for (const call of calls) {
      expect(call.fields).toMatchObject({ isoCode: "T1", portalUrl: seed.portalUrl });
    }
    expect(calls[1]?.fields).toMatchObject({ ok: true, status: 200, latencyMs: 3 });
    expect(calls[4]?.fields).toMatchObject({
      provider: "fake",
      method: PROBE_METHOD.FAILED,
      error: "boom",
    });
  });
});

describe("probeWorkflow logger", () => {
  it("logs start and direct completion on direct success", async () => {
    fetchOk();
    const { logger, calls } = createRecordingLogger();
    const result = await probeWorkflow(seed, { logger });
    expect(result.method).toBe("direct");
    expect(calls.map((call) => call.message)).toEqual([PROBE_LOG_EVENT.START, PROBE_LOG_EVENT.DIRECT_COMPLETE]);
    expect(calls[0]?.fields).toMatchObject({ isoCode: "T1", portalUrl: seed.portalUrl });
    expect(calls[1]?.fields).toMatchObject({ isoCode: "T1", ok: true, status: 200 });
  });

  it("logs start, direct completion, and failure without a browser provider", async () => {
    fetchFail();
    const { logger, calls } = createRecordingLogger();
    const result = await probeWorkflow(seed, { logger });
    expect(result.method).toBe("failed");
    expect(calls.map((call) => call.message)).toEqual([
      PROBE_LOG_EVENT.START,
      PROBE_LOG_EVENT.DIRECT_COMPLETE,
      PROBE_LOG_EVENT.FAILED,
    ]);
    expect(calls[2]?.level).toBe("error");
    expect(calls[2]?.fields).toMatchObject({ provider: null, method: PROBE_METHOD.FAILED });
  });

  it("logs fallback and browser completion and never logs page contents", async () => {
    fetchFail();
    const { logger, calls } = createRecordingLogger();
    const result = await probeWorkflow(seed, {
      logger,
      browserProvider: fakeProvider(),
      browserOptions: { stealth: true, proxyCountry: "MX", captcha: true },
    });
    expect(result.method).toBe("browser");
    expect(calls.map((call) => call.message)).toEqual([
      PROBE_LOG_EVENT.START,
      PROBE_LOG_EVENT.DIRECT_COMPLETE,
      PROBE_LOG_EVENT.BROWSER_FALLBACK,
      PROBE_LOG_EVENT.BROWSER_COMPLETE,
    ]);
    const serialized = JSON.stringify(calls).toLowerCase();
    expect(serialized).not.toContain("secret-page-body");
    expect(serialized).not.toContain("cookies");
    const fallback = calls[2]?.fields;
    expect(fallback).toMatchObject({ isoCode: "T1", provider: "fake" });
    expect(fallback).toMatchObject({ stealth: true, proxyCountry: "MX", captcha: true });
    const complete = calls[3]?.fields;
    expect(complete).toMatchObject({ isoCode: "T1", provider: "fake", status: 200 });
  });

  it("logs failure when the browser provider throws", async () => {
    fetchFail();
    const { logger, calls } = createRecordingLogger();
    const result = await probeWorkflow(seed, {
      logger,
      browserProvider: fakeProvider(new Error("browser unavailable")),
    });
    expect(result.method).toBe("failed");
    expect(calls.map((call) => call.message)).toEqual([
      PROBE_LOG_EVENT.START,
      PROBE_LOG_EVENT.DIRECT_COMPLETE,
      PROBE_LOG_EVENT.BROWSER_FALLBACK,
      PROBE_LOG_EVENT.FAILED,
    ]);
    expect(calls[3]?.level).toBe("error");
    expect(calls[3]?.fields).toMatchObject({ provider: "fake", error: "browser unavailable" });
  });
});
