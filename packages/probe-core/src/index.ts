/**
 * Opt-in browser capabilities for one probe run. Every field is optional and
 * unset means provider default. Cost-incurring options (proxy egress,
 * stealth, CAPTCHA handling) must never be enabled without a reason from an
 * observed run.
 */
export interface BrowserProbeOptions {
  /** Two-letter country code for provider proxy egress. */
  proxyCountry?: string;
  /** Request provider stealth/anti-detection measures. */
  stealth?: boolean;
  /** Allow provider CAPTCHA handling where the target's terms permit it. */
  captcha?: boolean;
}

/**
 * One browser tab owned by the workflow. Created per probe and always closed
 * afterwards, on success and on failure.
 */
export interface BrowserProbePage {
  /**
   * Navigate to a URL.
   * @param url - Candidate portal URL to load.
   * @returns The observed HTTP response, or null when the provider reports none.
   */
  goto(url: string): Promise<BrowserProbeResponse | null>;
  /** @returns The rendered page title. */
  title(): Promise<string>;
  /** @returns The rendered body text (never passed to the logger). */
  text(): Promise<string>;
  /** Release the tab. Always called by the workflow. */
  close(): Promise<void>;
}

/** HTTP-level response for a navigation, when the provider observed one. */
export interface BrowserProbeResponse {
  /** @returns The HTTP status, or null when the provider reports none. */
  status(): number | null;
  /** @returns The final URL after redirects. */
  url(): string;
}

/**
 * Browser instance owning one or more pages. Created per probe and always
 * closed afterwards, on success and on failure.
 */
export interface BrowserProbeSession {
  /** @returns A fresh tab for one portal navigation. */
  newPage(): Promise<BrowserProbePage>;
  /** Release the browser and any provider-side resources. Always called. */
  close(): Promise<void>;
}

/**
 * Provider-neutral browser capability. The only browser seam the workflow
 * knows; vendor SDKs stay behind implementations of this contract.
 */
export interface BrowserProbeProvider {
  /** Stable provider name recorded in results and logs (e.g. `"solari"`). */
  readonly name: string;
  /**
   * Open a browser session.
   * @param options - Opt-in capabilities for this run.
   * @returns A session the caller must close.
   */
  launch(options?: BrowserProbeOptions): Promise<BrowserProbeSession>;
}

/** Outcome of one lightweight direct HTTP probe. Never throws. */
export interface DirectProbeResult {
  /** True only for a 2xx response. A 2xx alone never means verified. */
  ok: boolean;
  /** Observed HTTP status, or null on network/timeout failure. */
  status: number | null;
  /** Final URL after redirects, or null when no response arrived. */
  finalUrl: string | null;
  /** Wall-clock time for the attempt, including failures. */
  latencyMs: number;
  /** Page title when captured; direct probes leave this null. */
  title: string | null;
  /** Failure reason (`HTTP <status>` or the network error), or null on success. */
  error: string | null;
}

/**
 * Outcome vocabulary for a workflow run. Use these constants, never string
 * literals, so result handling stays exhaustive.
 */
export const PROBE_METHOD = {
  DIRECT: "direct",
  BROWSER: "browser",
  FAILED: "failed",
} as const;

/**
 * Evidence vocabulary for a workflow run. Entries claim only what was
 * observed: a missing response yields no `*_RESPONSE` entry.
 */
export const PROBE_EVIDENCE = {
  DIRECT_RESPONSE: "direct_response",
  BROWSER_RESPONSE: "browser_response",
  BROWSER_TEXT: "browser_text",
} as const;

/** One of the {@link PROBE_METHOD} outcome values. */
export type ProbeMethod = (typeof PROBE_METHOD)[keyof typeof PROBE_METHOD];

/**
 * Complete record of one seed probe: direct-first attempt, optional browser
 * fallback, and the evidence backing the outcome. Failed runs carry the error
 * and empty evidence instead of verified claims.
 */
export interface WorkflowResult {
  /** Input hypothesis, echoed for provenance. */
  seed: {
    isoCode: string;
    countryName: string;
    portalUrl: string;
    sourceUrl: string;
  };
  /** How the run concluded; see {@link PROBE_METHOD}. */
  method: ProbeMethod;
  /** Provider name on the browser path, otherwise null. */
  provider: string | null;
  /** Direct attempt outcome, always present. */
  direct: DirectProbeResult;
  /** Browser observation (status, URLs, title, text), or null when unused. */
  browser: {
    status: number | null;
    finalUrl: string | null;
    title: string | null;
    text: string | null;
  } | null;
  /** Observed-evidence keys; see {@link PROBE_EVIDENCE}. */
  evidence: string[];
  /** Terminal failure reason, or null when the run produced an observation. */
  error: string | null;
}

export { DEFAULT_DIRECT_PROBE_TIMEOUT_MS, runDirectProbe } from "./direct-probe.js";
export { consoleProbeLogger, logProbeEvent, noopProbeLogger, PROBE_EVENT_LEVEL, PROBE_LOG_EVENT } from "./logger.js";
export type {
  LogFields,
  ProbeBrowserCompleteFields,
  ProbeBrowserFallbackFields,
  ProbeDirectCompleteFields,
  ProbeEventFields,
  ProbeFailedFields,
  ProbeLogEvent,
  ProbeLogFields,
  ProbeLogger,
  ProbeStartFields,
} from "./logger.js";
