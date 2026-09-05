import { describe, expect, it } from "vitest";
import { PROBE_LOG_EVENT } from "@tariff-radar/probe-core";
import { formatStage, humanProbeLogger } from "../../packages/cli/src/index.js";

describe("formatStage", () => {
  it("announces each seed run", () => {
    expect(formatStage(PROBE_LOG_EVENT.START, { isoCode: "US", portalUrl: "https://hts.usitc.gov/" })).toBe(
      "── US https://hts.usitc.gov/",
    );
  });

  it("reports a direct success", () => {
    expect(
      formatStage(PROBE_LOG_EVENT.DIRECT_COMPLETE, {
        isoCode: "US",
        portalUrl: "https://hts.usitc.gov/",
        ok: true,
        status: 200,
        finalUrl: "https://hts.usitc.gov/",
        latencyMs: 533,
        error: null,
      }),
    ).toBe("   direct: HTTP 200 in 533ms");
  });

  it("reports a direct failure with and without a reason", () => {
    const failed = {
      isoCode: "CN",
      portalUrl: "http://english.customs.gov.cn/service/query",
      ok: false,
      status: null,
      finalUrl: null,
      latencyMs: 771,
    };
    expect(formatStage(PROBE_LOG_EVENT.DIRECT_COMPLETE, { ...failed, error: "fetch failed" })).toBe(
      "   direct: failed (fetch failed)",
    );
    expect(formatStage(PROBE_LOG_EVENT.DIRECT_COMPLETE, { ...failed, error: null })).toBe(
      "   direct: failed (unknown error)",
    );
  });

  it("announces the browser fallback", () => {
    expect(
      formatStage(PROBE_LOG_EVENT.BROWSER_FALLBACK, {
        isoCode: "CN",
        portalUrl: "http://english.customs.gov.cn/service/query",
        provider: "solari",
      }),
    ).toBe("   browser via solari…");
  });

  it("reports the browser observation with and without a response", () => {
    const observed = { isoCode: "CN", portalUrl: "http://english.customs.gov.cn/service/query", provider: "solari" };
    expect(formatStage(PROBE_LOG_EVENT.BROWSER_COMPLETE, { ...observed, status: 200, finalUrl: null })).toBe(
      "   browser: HTTP 200",
    );
    expect(formatStage(PROBE_LOG_EVENT.BROWSER_COMPLETE, { ...observed, status: null, finalUrl: null })).toBe(
      "   browser: no response",
    );
    expect(formatStage(PROBE_LOG_EVENT.BROWSER_COMPLETE, { ...observed, finalUrl: null })).toBe(
      "   browser: no response",
    );
  });

  it("reports terminal failures", () => {
    expect(
      formatStage(PROBE_LOG_EVENT.FAILED, {
        isoCode: "BR",
        portalUrl: "https://www.gov.br/",
        provider: "solari",
        method: "failed",
        error: "LocalProxy not started",
      }),
    ).toBe("   failed: LocalProxy not started");
  });

  it("passes unknown events through", () => {
    expect(formatStage("probe.unknown", {})).toBe("probe.unknown");
  });
});

describe("humanProbeLogger", () => {
  it("writes one line per level without touching the console", () => {
    const lines: string[] = [];
    const logger = humanProbeLogger((line) => lines.push(line));
    logger.debug("probe.unknown", {});
    logger.info(PROBE_LOG_EVENT.START, { isoCode: "US", portalUrl: "https://hts.usitc.gov/" });
    logger.warn("probe.unknown");
    logger.error(PROBE_LOG_EVENT.FAILED, {
      isoCode: "US",
      portalUrl: "https://hts.usitc.gov/",
      provider: null,
      method: "failed",
      error: "nope",
    });
    expect(lines).toEqual(["probe.unknown", "── US https://hts.usitc.gov/", "probe.unknown", "   failed: nope"]);
  });
});
