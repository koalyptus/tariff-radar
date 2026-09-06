import { describe, expect, it } from "vitest";
import { parseProbeArgs, HelpRequested } from "@tariff-radar/cli";

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
