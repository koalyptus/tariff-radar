import { describe, expect, it } from "vitest";
import { DEFAULT_DIRECT_PROBE_TIMEOUT_MS, PROBE_EVIDENCE, PROBE_METHOD } from "@tariff-radar/probe-core";

// Smoke test for the test runner itself: test discovery, TypeScript
// transform, and workspace alias resolution.
describe("test runner smoke", () => {
  it("exposes the probe contract constants", () => {
    expect(PROBE_METHOD.DIRECT).toBe("direct");
    expect(PROBE_METHOD.BROWSER).toBe("browser");
    expect(PROBE_METHOD.FAILED).toBe("failed");
    expect(PROBE_EVIDENCE.DIRECT_RESPONSE).toBe("direct_response");
    expect(DEFAULT_DIRECT_PROBE_TIMEOUT_MS).toBe(10_000);
  });
});
