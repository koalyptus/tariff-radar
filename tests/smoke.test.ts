import { describe, expect, it } from "vitest"
import {
  DEFAULT_DIRECT_PROBE_TIMEOUT_MS,
  PROBE_EVIDENCE,
  PROBE_METHOD,
} from "@tariff-radar/probe-core"

// Phase 1 runner smoke test: proves `pnpm test` discovers tests, transforms
// TypeScript, and resolves the workspace alias. Behavioural suites live in
// Phase 5 and must not be seeded here.
describe("test runner smoke", () => {
  it("exposes the probe contract constants", () => {
    expect(PROBE_METHOD.DIRECT).toBe("direct")
    expect(PROBE_METHOD.BROWSER).toBe("browser")
    expect(PROBE_METHOD.FAILED).toBe("failed")
    expect(PROBE_EVIDENCE.DIRECT_RESPONSE).toBe("direct_response")
    expect(DEFAULT_DIRECT_PROBE_TIMEOUT_MS).toBe(10_000)
  })
})
