import { PROBE_EVIDENCE, PROBE_METHOD, runDirectProbe } from "@tariff-radar/probe-core"
import type {
  BrowserProbeOptions,
  BrowserProbeProvider,
  WorkflowResult,
} from "@tariff-radar/probe-core"

const DIRECT_PROBE_FAILURE = "direct probe failed and no browser provider was configured"

export interface WorkflowSeed {
  isoCode: string
  countryName: string
  portalUrl: string
  sourceUrl: string
}

export interface ProbeWorkflowOptions {
  browserProvider?: BrowserProbeProvider
  browserOptions?: BrowserProbeOptions
  timeoutMs?: number
}

export async function runProbeWorkflow(
  seed: WorkflowSeed,
  options: ProbeWorkflowOptions = {},
): Promise<WorkflowResult> {
  const direct = await runDirectProbe(seed.portalUrl, options.timeoutMs)

  if (direct.ok) {
    return {
      seed,
      method: PROBE_METHOD.DIRECT,
      provider: null,
      direct,
      browser: null,
      evidence: [PROBE_EVIDENCE.DIRECT_RESPONSE],
      error: null,
    }
  }

  if (!options.browserProvider) {
    return {
      seed,
      method: PROBE_METHOD.FAILED,
      provider: null,
      direct,
      browser: null,
      evidence: [],
      error: DIRECT_PROBE_FAILURE,
    }
  }

  try {
    const session = await options.browserProvider.launch(options.browserOptions)
    try {
      const page = await session.newPage()
      try {
        const response = await page.goto(seed.portalUrl)
        const text = await page.text()
        const status = response?.status() ?? null
        return {
          seed,
          method: PROBE_METHOD.BROWSER,
          provider: options.browserProvider.name,
          direct,
          browser: {
            status,
            finalUrl: response?.url() ?? null,
            title: await page.title(),
            text,
          },
          // Claim only what was observed: a null response yields no
          // browser_response evidence. Method still reports BROWSER because
          // the page rendered; Phase 10 defines what turns observations
          // into verified records.
          evidence: [
            ...(status !== null ? [PROBE_EVIDENCE.BROWSER_RESPONSE] : []),
            PROBE_EVIDENCE.BROWSER_TEXT,
          ],
          error: null,
        }
      } finally {
        await page.close()
      }
    } finally {
      await session.close()
    }
  } catch (error) {
    return {
      seed,
      method: PROBE_METHOD.FAILED,
      provider: options.browserProvider.name,
      direct,
      browser: null,
      evidence: [],
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

