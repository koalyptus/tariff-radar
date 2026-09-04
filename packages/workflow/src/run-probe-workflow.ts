import {
  PROBE_EVIDENCE,
  PROBE_LOG_EVENT,
  PROBE_METHOD,
  noopProbeLogger,
  runDirectProbe,
} from "@tariff-radar/probe-core";
import type { BrowserProbeOptions, BrowserProbeProvider, ProbeLogger, WorkflowResult } from "@tariff-radar/probe-core";

const DIRECT_PROBE_FAILURE = "direct probe failed and no browser provider was configured";

export interface WorkflowSeed {
  isoCode: string;
  countryName: string;
  portalUrl: string;
  sourceUrl: string;
}

export interface ProbeWorkflowOptions {
  browserProvider?: BrowserProbeProvider;
  browserOptions?: BrowserProbeOptions;
  timeoutMs?: number;
  logger?: ProbeLogger;
}

export async function runProbeWorkflow(
  seed: WorkflowSeed,
  options: ProbeWorkflowOptions = {},
): Promise<WorkflowResult> {
  const logger = options.logger ?? noopProbeLogger;
  logger.info(PROBE_LOG_EVENT.START, { isoCode: seed.isoCode, portalUrl: seed.portalUrl });

  const direct = await runDirectProbe(seed.portalUrl, options.timeoutMs);
  logger.info(PROBE_LOG_EVENT.DIRECT_COMPLETE, {
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
    logger.error(PROBE_LOG_EVENT.FAILED, {
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

  logger.info(PROBE_LOG_EVENT.BROWSER_FALLBACK, {
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
        logger.info(PROBE_LOG_EVENT.BROWSER_COMPLETE, {
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
    logger.error(PROBE_LOG_EVENT.FAILED, {
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
