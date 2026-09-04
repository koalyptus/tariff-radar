import type { ProbeMethod } from "./index.js";

// Flat, JSON-safe fields any structured logger can render. The transport
// stays general-purpose on purpose: probe, registry, and CLI logging can all
// share it, and a future framework logger (pino, OTel, …) only needs a thin
// adapter from these four methods.
export type LogFields = Record<string, string | number | boolean | null | undefined>;

export interface ProbeLogger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

export const PROBE_LOG_EVENT = {
  START: "probe.start",
  DIRECT_COMPLETE: "probe.direct.complete",
  BROWSER_FALLBACK: "probe.browser.fallback",
  BROWSER_COMPLETE: "probe.browser.complete",
  FAILED: "probe.failed",
} as const;

export type ProbeLogEvent = (typeof PROBE_LOG_EVENT)[keyof typeof PROBE_LOG_EVENT];

// Fixed per-event schemas. Call sites build these, never ad-hoc shapes.
export type ProbeStartFields = {
  isoCode: string;
  portalUrl: string;
};

export type ProbeDirectCompleteFields = {
  isoCode: string;
  portalUrl: string;
  ok: boolean;
  status: number | null;
  finalUrl: string | null;
  latencyMs: number;
  error: string | null;
};

export type ProbeBrowserFallbackFields = {
  isoCode: string;
  portalUrl: string;
  provider: string;
};

export type ProbeBrowserCompleteFields = {
  isoCode: string;
  portalUrl: string;
  provider: string;
  status: number | null;
  finalUrl: string | null;
};

export type ProbeFailedFields = {
  isoCode: string;
  portalUrl: string;
  provider: string | null;
  method: ProbeMethod;
  error: string;
};

// Union of every event payload, for holders that record heterogeneous calls
// (e.g. the recording logger in tests).
export type ProbeLogFields =
  | ProbeStartFields
  | ProbeDirectCompleteFields
  | ProbeBrowserFallbackFields
  | ProbeBrowserCompleteFields
  | ProbeFailedFields;

// Event-keyed schemas: the compiler only accepts the payload that belongs to
// the event name.
export type ProbeEventFields = {
  [PROBE_LOG_EVENT.START]: ProbeStartFields;
  [PROBE_LOG_EVENT.DIRECT_COMPLETE]: ProbeDirectCompleteFields;
  [PROBE_LOG_EVENT.BROWSER_FALLBACK]: ProbeBrowserFallbackFields;
  [PROBE_LOG_EVENT.BROWSER_COMPLETE]: ProbeBrowserCompleteFields;
  [PROBE_LOG_EVENT.FAILED]: ProbeFailedFields;
};

// Level is part of the event spec, so call sites never choose it per call.
export const PROBE_EVENT_LEVEL = {
  [PROBE_LOG_EVENT.START]: "info",
  [PROBE_LOG_EVENT.DIRECT_COMPLETE]: "info",
  [PROBE_LOG_EVENT.BROWSER_FALLBACK]: "info",
  [PROBE_LOG_EVENT.BROWSER_COMPLETE]: "info",
  [PROBE_LOG_EVENT.FAILED]: "error",
} as const;

// Typed entry point for probe logging: general transport, probe-specific
// shapes. A wrong payload for the event name fails compilation.
export function logProbeEvent<E extends ProbeLogEvent>(
  logger: ProbeLogger,
  event: E,
  fields: ProbeEventFields[E],
): void {
  logger[PROBE_EVENT_LEVEL[event]](event, fields);
}

// Minimal structured console logger for the CLI. It only renders the safe
// fields the caller passes, so secrets and page contents never reach the
// output unless a caller explicitly includes them (workflow never does).
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

// Silent default for library use and unit tests. Tests that assert on log
// calls inject their own recording logger instead.
export const noopProbeLogger: ProbeLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
