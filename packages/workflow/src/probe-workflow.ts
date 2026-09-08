import {
  PROBE_EVIDENCE,
  PROBE_METHOD,
  ProbeRunLogger,
  assessContentRelevance,
  noopProbeLogger,
  runDirectProbe,
} from "@tariff-radar/probe-core";
import type { BrowserProbeOptions, BrowserProbeProvider, ProbeLogger, WorkflowResult } from "@tariff-radar/probe-core";

const DIRECT_PROBE_FAILURE = "direct probe failed and no browser provider was configured";

/** One manually selected portal hypothesis fed into the probe workflow. */
export interface WorkflowSeed {
  isoCode: string;
  countryName: string;
  authority: string;
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
export async function probeWorkflow(seed: WorkflowSeed, options: ProbeWorkflowOptions = {}): Promise<WorkflowResult> {
  const log = new ProbeRunLogger(options.logger ?? noopProbeLogger, seed);
  log.start();

  const direct = await runDirectProbe(seed.portalUrl, options.timeoutMs);
  log.directComplete(direct);

  if (direct.ok) {
    const relevance = assessContentRelevance({ title: null, text: direct.text });
    return {
      seed,
      method: PROBE_METHOD.DIRECT,
      provider: null,
      direct,
      browser: null,
      // Transport success plus whatever the body scan observed: a keyword
      // hit is content evidence, but the record stays unverified either way.
      evidence: [PROBE_EVIDENCE.DIRECT_RESPONSE, ...relevance.evidence],
      error: null,
    };
  }

  if (!options.browserProvider) {
    log.failed(null, DIRECT_PROBE_FAILURE);
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

  log.browserFallback(options.browserProvider.name, options.browserOptions);
  const browserStartedAt = performance.now();

  try {
    const session = await options.browserProvider.launch(options.browserOptions);
    try {
      const page = await session.newPage();
      try {
        const response = await page.goto(seed.portalUrl);
        const text = await page.text();
        const title = await page.title();
        const status = response?.status() ?? null;
        const finalUrl = response?.url() ?? null;
        const latencyMs = Math.round(performance.now() - browserStartedAt);
        log.browserComplete(options.browserProvider.name, status, finalUrl, latencyMs);
        const relevance = assessContentRelevance({ title, text });
        const sessionId = session.sessionId ?? null;
        return {
          seed,
          method: PROBE_METHOD.BROWSER,
          provider: options.browserProvider.name,
          direct,
          browser: {
            status,
            finalUrl,
            title,
            text,
            sessionId,
            latencyMs,
          },
          // Claim only what was observed: a null response yields no
          // browser_response evidence, even though the page rendered.
          // Keyword evidence comes from the pure content-relevance check;
          // transport success alone never implies relevance.
          evidence: [
            ...(status !== null ? [PROBE_EVIDENCE.BROWSER_RESPONSE] : []),
            PROBE_EVIDENCE.BROWSER_TEXT,
            ...relevance.evidence,
          ],
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
    log.failed(options.browserProvider.name, message);
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
