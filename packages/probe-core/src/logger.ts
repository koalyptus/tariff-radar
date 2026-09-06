import { PROBE_METHOD } from "./constants.js";
import type { BrowserProbeOptions, DirectProbeResult, ProbeMethod } from "./index.js";

/**
 * Flat, JSON-safe fields any structured logger can render. The transport
 * stays general-purpose on purpose: probe, registry, and CLI logging can all
 * share it, and a future framework logger (pino, OTel, …) only needs a thin
 * adapter from the four {@link ProbeLogger} methods.
 */
export type LogFields = Record<string, string | number | boolean | null | undefined>;

/**
 * Minimal structured logger contract: level, event name, and flat fields.
 * Implementations render; they never decide what is safe — callers only pass
 * the fixed per-event schemas below.
 */
export interface ProbeLogger {
  /** Log at debug level. */
  debug(message: string, fields?: LogFields): void;
  /** Log at info level. */
  info(message: string, fields?: LogFields): void;
  /** Log at warn level. */
  warn(message: string, fields?: LogFields): void;
  /** Log at error level. */
  error(message: string, fields?: LogFields): void;
}

/**
 * Log event vocabulary for a probe run. Use these constants, never string
 * literals, so emitting and reading logs stays consistent.
 */
export const PROBE_LOG_EVENT = {
  START: "probe.start",
  DIRECT_COMPLETE: "probe.direct.complete",
  BROWSER_FALLBACK: "probe.browser.fallback",
  BROWSER_COMPLETE: "probe.browser.complete",
  FAILED: "probe.failed",
} as const;

/** One of the {@link PROBE_LOG_EVENT} values. */
export type ProbeLogEvent = (typeof PROBE_LOG_EVENT)[keyof typeof PROBE_LOG_EVENT];

/** Payload for {@link PROBE_LOG_EVENT.START: the run identity. */
export type ProbeStartFields = {
  isoCode: string;
  portalUrl: string;
};

/** Payload for {@link PROBE_LOG_EVENT.DIRECT_COMPLETE: the direct outcome. */
export type ProbeDirectCompleteFields = {
  isoCode: string;
  portalUrl: string;
  ok: boolean;
  status: number | null;
  finalUrl: string | null;
  latencyMs: number;
  error: string | null;
};

/** Payload for {@link PROBE_LOG_EVENT.BROWSER_FALLBACK: the escalation decision. */
export type ProbeBrowserFallbackFields = {
  isoCode: string;
  portalUrl: string;
  provider: string;
  /** Effective stealth flag, when the run opted in. */
  stealth?: boolean;
  /** Effective proxy egress country, when the run opted in. */
  proxyCountry?: string;
  /** Effective CAPTCHA flag, when the run opted in. */
  captcha?: boolean;
};

/**
 * Payload for {@link PROBE_LOG_EVENT.BROWSER_COMPLETE: the browser
 * observation. Title and page text are deliberately excluded — observable
 * metadata only.
 */
export type ProbeBrowserCompleteFields = {
  isoCode: string;
  portalUrl: string;
  provider: string;
  status: number | null;
  finalUrl: string | null;
  /** Wall-clock time for the browser fallback, launch through observation. */
  latencyMs: number;
};

/** Payload for {@link PROBE_LOG_EVENT.FAILED: the terminal failure. */
export type ProbeFailedFields = {
  isoCode: string;
  portalUrl: string;
  provider: string | null;
  method: ProbeMethod;
  error: string;
};

/**
 * Union of every event payload, for holders that record heterogeneous calls
 * (e.g. the recording logger in tests).
 */
export type ProbeLogFields =
  | ProbeStartFields
  | ProbeDirectCompleteFields
  | ProbeBrowserFallbackFields
  | ProbeBrowserCompleteFields
  | ProbeFailedFields;

/**
 * Per-run emitter with the run identity bound once. Call sites pass domain
 * values, never assembled objects: the fixed wire schemas below are built
 * inside these methods. The JSON lines on the wire are unchanged.
 */
export class ProbeRunLogger {
  private readonly logger: ProbeLogger;
  private readonly isoCode: string;
  private readonly portalUrl: string;

  /**
   * Bind one run's identity.
   * @param logger - Destination for the structured lines.
   * @param seed - Run identity; only ISO code and portal URL are ever logged.
   */
  constructor(logger: ProbeLogger, seed: { isoCode: string; portalUrl: string }) {
    this.logger = logger;
    this.isoCode = seed.isoCode;
    this.portalUrl = seed.portalUrl;
  }

  /** Log run start. */
  start(): void {
    const fields: ProbeStartFields = { isoCode: this.isoCode, portalUrl: this.portalUrl };
    this.logger.info(PROBE_LOG_EVENT.START, fields);
  }

  /**
   * Log the direct attempt outcome.
   * @param direct - Observed direct result, logged field for field.
   */
  directComplete(direct: DirectProbeResult): void {
    const fields: ProbeDirectCompleteFields = {
      isoCode: this.isoCode,
      portalUrl: this.portalUrl,
      ok: direct.ok,
      status: direct.status,
      finalUrl: direct.finalUrl,
      latencyMs: direct.latencyMs,
      error: direct.error,
    };
    this.logger.info(PROBE_LOG_EVENT.DIRECT_COMPLETE, fields);
  }

  /**
   * Log escalation to the browser after direct failure.
   * @param provider - Provider name taking over the run.
   * @param options - Effective opt-in capabilities, so the run record shows
   * exactly what the browser used.
   */
  browserFallback(provider: string, options?: BrowserProbeOptions): void {
    const fields: ProbeBrowserFallbackFields = {
      isoCode: this.isoCode,
      portalUrl: this.portalUrl,
      provider,
      stealth: options?.stealth,
      proxyCountry: options?.proxyCountry,
      captcha: options?.captcha,
    };
    this.logger.info(PROBE_LOG_EVENT.BROWSER_FALLBACK, fields);
  }

  /**
   * Log the browser observation. Title and page text are never logged.
   * @param provider - Provider name that ran the browser.
   * @param status - Observed HTTP status, or null when the page gave none.
   * @param finalUrl - Observed final URL, or null when the page gave none.
   * @param latencyMs - Wall-clock time for the fallback.
   */
  browserComplete(provider: string, status: number | null, finalUrl: string | null, latencyMs: number): void {
    const fields: ProbeBrowserCompleteFields = {
      isoCode: this.isoCode,
      portalUrl: this.portalUrl,
      provider,
      status,
      finalUrl,
      latencyMs,
    };
    this.logger.info(PROBE_LOG_EVENT.BROWSER_COMPLETE, fields);
  }

  /**
   * Log terminal failure.
   * @param provider - Provider name, or null when no provider was configured.
   * @param error - Failure reason.
   */
  failed(provider: string | null, error: string): void {
    const fields: ProbeFailedFields = {
      isoCode: this.isoCode,
      portalUrl: this.portalUrl,
      provider,
      method: PROBE_METHOD.FAILED,
      error,
    };
    this.logger.error(PROBE_LOG_EVENT.FAILED, fields);
  }
}

/**
 * Minimal structured console logger for the CLI. Renders one JSON line per
 * call. It only renders the safe fields the caller passes, so secrets and
 * page contents never reach the output unless a caller explicitly includes
 * them (the workflow never does).
 */
export const consoleProbeLogger: ProbeLogger = {
  debug: (message, fields) => {
    console.debug(JSON.stringify({ level: "debug", message, ...fields }));
  },
  info: (message, fields) => {
    console.info(JSON.stringify({ level: "info", message, ...fields }));
  },
  warn: (message, fields) => {
    console.warn(JSON.stringify({ level: "warn", message, ...fields }));
  },
  error: (message, fields) => {
    console.error(JSON.stringify({ level: "error", message, ...fields }));
  },
};

/**
 * Silent default for library use and unit tests. Tests that assert on log
 * calls inject their own recording logger instead.
 */
export const noopProbeLogger: ProbeLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
