import {
  PROBE_EVIDENCE,
  PROBE_LOG_EVENT,
  PROBE_METHOD,
  logProbeEvent,
  noopProbeLogger,
  runDirectProbe,
} from "@tariff-radar/probe-core";
import type { BrowserProbeOptions, BrowserProbeProvider, ProbeLogger, WorkflowResult } from "@tariff-radar/probe-core";

const DIRECT_PROBE_FAILURE = "direct probe failed and no browser provider was configured";

/** One manually selected portal hypothesis fed into the probe workflow. */
export interface WorkflowSeed {
  isoCode: string;
  countryName: string;
  portalUrl: string;
  sourceUrl: string;
}

/**
 * Knobs for one workflow run. Everything is optional: without a browser
 * provider the run is direct-only and reports failure when direct fails.
 */
export interface ProbeWorkflowOptions {
  /** Browser provider for fallback after direct failure. */
  browserProvider?: BrowserProbeProvider;
  /** Opt-in browser capabilities forwarded to the provider. */
  browserOptions?: BrowserProbeOptions;
  /** Direct-probe timeout override. */
  timeoutMs?: number;
  /** Structured logger; defaults to silent. Never receives page contents. */
  logger?: ProbeLogger;
}

/**
 * Probe one seed direct-first, escalating to the browser provider only after
 * direct failure. Page and session are always closed, on success and on
 * failure. Logs start, direct completion, browser fallback, browser
 * completion, and failure events with safe structured context.
 * @param seed - Candidate portal hypothesis with provenance URLs.
 * @param options - Browser provider, timeouts, and logger overrides.
 * @returns The workflow result; failures carry the error, never guesses.
 */
export async function runProbeWorkflow(
  seed: WorkflowSeed,
  options: ProbeWorkflowOptions = {},
): Promise<WorkflowResult> {
  const logger = options.logger ?? noopProbeLogger;
  logProbeEvent(logger, PROBE_LOG_EVENT.START, { isoCode: seed.isoCode, portalUrl: seed.portalUrl });

  const direct = await runDirectProbe(seed.portalUrl, options.timeoutMs);
  logProbeEvent(logger, PROBE_LOG_EVENT.DIRECT_COMPLETE, {
    isoCode: seed.isoCode,
    portalUrl: seed.portalUrl,
    ok: direct.ok,
    status: direct.status,
    finalUrl: direct.finalUrl,
    latencyMs: direct.latencyMs,
    error: direct.error,
  });

  if (direct.ok) {
    return {
      seed,
      method: PROBE_METHOD.DIRECT,
      provider: null,
      direct,
      browser: null,
      evidence: [PROBE_EVIDENCE.DIRECT_RESPONSE],
      error: null,
    };
  }

  if (!options.browserProvider) {
    logProbeEvent(logger, PROBE_LOG_EVENT.FAILED, {
      isoCode: seed.isoCode,
      portalUrl: seed.portalUrl,
      provider: null,
      method: PROBE_METHOD.FAILED,
      error: DIRECT_PROBE_FAILURE,
    });
    return {
      seed,
      method: PROBE_METHOD.FAILED,
      provider: null,
      direct,
      browser: null,
      evidence: [],
      error: DIRECT_PROBE_FAILURE,
    };
  }

  logProbeEvent(logger, PROBE_LOG_EVENT.BROWSER_FALLBACK, {
    isoCode: seed.isoCode,
    portalUrl: seed.portalUrl,
    provider: options.browserProvider.name,
  });

  try {
    const session = await options.browserProvider.launch(options.browserOptions);
    try {
      const page = await session.newPage();
      try {
        const response = await page.goto(seed.portalUrl);
        const text = await page.text();
        const status = response?.status() ?? null;
        const finalUrl = response?.url() ?? null;
        logProbeEvent(logger, PROBE_LOG_EVENT.BROWSER_COMPLETE, {
          isoCode: seed.isoCode,
          portalUrl: seed.portalUrl,
          provider: options.browserProvider.name,
          status,
          finalUrl,
        });
        return {
          seed,
          method: PROBE_METHOD.BROWSER,
          provider: options.browserProvider.name,
          direct,
          browser: {
            status,
            finalUrl,
            title: await page.title(),
            text,
          },
          // Claim only what was observed: a null response yields no
          // browser_response evidence, even though the page rendered.
          evidence: [...(status !== null ? [PROBE_EVIDENCE.BROWSER_RESPONSE] : []), PROBE_EVIDENCE.BROWSER_TEXT],
          error: null,
        };
      } finally {
        await page.close();
      }
    } finally {
      await session.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logProbeEvent(logger, PROBE_LOG_EVENT.FAILED, {
      isoCode: seed.isoCode,
      portalUrl: seed.portalUrl,
      provider: options.browserProvider.name,
      method: PROBE_METHOD.FAILED,
      error: message,
    });
    return {
      seed,
      method: PROBE_METHOD.FAILED,
      provider: options.browserProvider.name,
      direct,
      browser: null,
      evidence: [],
      error: message,
    };
  }
}
