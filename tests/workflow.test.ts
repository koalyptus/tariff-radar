import { afterEach, describe, expect, it, vi } from "vitest"
import { PROBE_EVIDENCE, PROBE_METHOD } from "@tariff-radar/probe-core"
import type { BrowserProbeProvider } from "@tariff-radar/probe-core"
import { runProbeWorkflow } from "@tariff-radar/workflow"
import type { WorkflowSeed } from "@tariff-radar/workflow"

const seed: WorkflowSeed = {
  isoCode: "T1",
  countryName: "Testland",
  portalUrl: "https://portal.example/tariff",
  sourceUrl: "https://authority.example/",
}

function fetchOk() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, url: "https://portal.example/tariff" })),
  )
}

function fetchFail() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("connection refused")
    }),
  )
}

function fakeProvider(hooks: {
  response: { status: number; url: string } | null
  launchError?: unknown
  gotoError?: unknown
  onPageClose?: () => void
  onSessionClose?: () => void
}): BrowserProbeProvider {
  return {
    name: "fake",
    launch: async () => {
      if (hooks.launchError !== undefined) throw hooks.launchError
      return {
        newPage: async () => ({
          goto: async () => {
            if (hooks.gotoError !== undefined) throw hooks.gotoError
            const response = hooks.response
            return response
              ? { status: () => response.status, url: () => response.url }
              : null
          },
          title: async () => "Tariff portal",
          text: async () => "customs duty tariff",
          close: async () => {
            hooks.onPageClose?.()
          },
        }),
        close: async () => {
          hooks.onSessionClose?.()
        },
      }
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("runProbeWorkflow", () => {
  it("returns the direct result when the direct probe succeeds", async () => {
    fetchOk()
    const result = await runProbeWorkflow(seed)
    expect(result.method).toBe(PROBE_METHOD.DIRECT)
    expect(result.provider).toBeNull()
    expect(result.browser).toBeNull()
    expect(result.direct.ok).toBe(true)
    expect(result.evidence).toEqual([PROBE_EVIDENCE.DIRECT_RESPONSE])
    expect(result.error).toBeNull()
  })

  it("fails without a browser provider after direct failure", async () => {
    fetchFail()
    const result = await runProbeWorkflow(seed)
    expect(result.method).toBe(PROBE_METHOD.FAILED)
    expect(result.provider).toBeNull()
    expect(result.browser).toBeNull()
    expect(result.evidence).toEqual([])
    expect(result.error).toContain("no browser provider")
  })

  it("falls back to the browser and closes page and session", async () => {
    fetchFail()
    let pageClosed = false
    let sessionClosed = false
    const result = await runProbeWorkflow(seed, {
      browserProvider: fakeProvider({
        response: { status: 200, url: "https://portal.example/final" },
        onPageClose: () => {
          pageClosed = true
        },
        onSessionClose: () => {
          sessionClosed = true
        },
      }),
    })
    expect(result.method).toBe(PROBE_METHOD.BROWSER)
    expect(result.provider).toBe("fake")
    expect(result.browser?.status).toBe(200)
    expect(result.browser?.finalUrl).toBe("https://portal.example/final")
    expect(result.browser?.title).toBe("Tariff portal")
    expect(result.evidence).toEqual([
      PROBE_EVIDENCE.BROWSER_RESPONSE,
      PROBE_EVIDENCE.BROWSER_TEXT,
    ])
    expect(result.error).toBeNull()
    expect(pageClosed).toBe(true)
    expect(sessionClosed).toBe(true)
  })

  it("records null browser location when the page reports no response", async () => {
    fetchFail()
    const result = await runProbeWorkflow(seed, {
      browserProvider: fakeProvider({ response: null }),
    })
    expect(result.method).toBe(PROBE_METHOD.BROWSER)
    expect(result.browser?.status).toBeNull()
    expect(result.browser?.finalUrl).toBeNull()
  })

  it("fails with the launch error when the browser provider throws", async () => {
    fetchFail()
    const result = await runProbeWorkflow(seed, {
      browserProvider: fakeProvider({
        response: { status: 200, url: "https://portal.example/final" },
        launchError: new Error("browser unavailable"),
      }),
    })
    expect(result.method).toBe(PROBE_METHOD.FAILED)
    expect(result.provider).toBe("fake")
    expect(result.browser).toBeNull()
    expect(result.error).toBe("browser unavailable")
  })

  it("stringifies non-Error browser failures", async () => {
    fetchFail()
    const result = await runProbeWorkflow(seed, {
      browserProvider: fakeProvider({
        response: { status: 200, url: "https://portal.example/final" },
        launchError: "plain failure",
      }),
    })
    expect(result.method).toBe(PROBE_METHOD.FAILED)
    expect(result.error).toBe("plain failure")
  })

  it("closes page and session when navigation throws", async () => {
    fetchFail()
    let pageClosed = false
    let sessionClosed = false
    const result = await runProbeWorkflow(seed, {
      browserProvider: fakeProvider({
        response: { status: 200, url: "https://portal.example/final" },
        gotoError: new Error("navigation failed"),
        onPageClose: () => {
          pageClosed = true
        },
        onSessionClose: () => {
          sessionClosed = true
        },
      }),
    })
    expect(result.method).toBe(PROBE_METHOD.FAILED)
    expect(result.error).toBe("navigation failed")
    expect(pageClosed).toBe(true)
    expect(sessionClosed).toBe(true)
  })
})
