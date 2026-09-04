import type { ProbeMethod } from "./index.js";

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
 * Event-keyed schemas: the compiler only accepts the payload that belongs to
 * the event name.
 */
export type ProbeEventFields = {
  [PROBE_LOG_EVENT.START]: ProbeStartFields;
  [PROBE_LOG_EVENT.DIRECT_COMPLETE]: ProbeDirectCompleteFields;
  [PROBE_LOG_EVENT.BROWSER_FALLBACK]: ProbeBrowserFallbackFields;
  [PROBE_LOG_EVENT.BROWSER_COMPLETE]: ProbeBrowserCompleteFields;
  [PROBE_LOG_EVENT.FAILED]: ProbeFailedFields;
};

/** Level is part of the event spec, so call sites never choose it per call. */
export const PROBE_EVENT_LEVEL = {
  [PROBE_LOG_EVENT.START]: "info",
  [PROBE_LOG_EVENT.DIRECT_COMPLETE]: "info",
  [PROBE_LOG_EVENT.BROWSER_FALLBACK]: "info",
  [PROBE_LOG_EVENT.BROWSER_COMPLETE]: "info",
  [PROBE_LOG_EVENT.FAILED]: "error",
} as const;

/**
 * Typed entry point for probe logging: general transport, probe-specific
 * shapes. A wrong payload for the event name fails compilation.
 * @param logger - Destination for the structured line.
 * @param event - One of {@link PROBE_LOG_EVENT}; also selects the level.
 * @param fields - The exact schema for that event; see {@link ProbeEventFields}.
 */
export function logProbeEvent<E extends ProbeLogEvent>(
  logger: ProbeLogger,
  event: E,
  fields: ProbeEventFields[E],
): void {
  logger[PROBE_EVENT_LEVEL[event]](event, fields);
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
