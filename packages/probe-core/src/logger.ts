import type { ProbeMethod } from "./index.js";

export const PROBE_LOG_EVENT = {
  START: "probe.start",
  DIRECT_COMPLETE: "probe.direct.complete",
  BROWSER_FALLBACK: "probe.browser.fallback",
  BROWSER_COMPLETE: "probe.browser.complete",
  FAILED: "probe.failed",
} as const;

export type ProbeLogEvent = (typeof PROBE_LOG_EVENT)[keyof typeof PROBE_LOG_EVENT];

export interface ProbeStartFields {
  isoCode: string;
  portalUrl: string;
}

export interface ProbeDirectCompleteFields {
  isoCode: string;
  portalUrl: string;
  ok: boolean;
  status: number | null;
  finalUrl: string | null;
  latencyMs: number;
  error: string | null;
}

export interface ProbeBrowserFallbackFields {
  isoCode: string;
  portalUrl: string;
  provider: string;
}

export interface ProbeBrowserCompleteFields {
  isoCode: string;
  portalUrl: string;
  provider: string;
  status: number | null;
  finalUrl: string | null;
}

export interface ProbeFailedFields {
  isoCode: string;
  portalUrl: string;
  provider: string | null;
  method: ProbeMethod;
  error: string;
}

// Union of every event payload, for holders that record heterogeneous calls
// (e.g. the recording logger in tests).
export type ProbeLogFields =
  | ProbeStartFields
  | ProbeDirectCompleteFields
  | ProbeBrowserFallbackFields
  | ProbeBrowserCompleteFields
  | ProbeFailedFields;

// Event-keyed schemas: each logger method only accepts the payload that
// belongs to the event name, so log shapes stay fixed and reviewable instead
// of drifting per call site.
export interface ProbeEventFields {
  [PROBE_LOG_EVENT.START]: ProbeStartFields;
  [PROBE_LOG_EVENT.DIRECT_COMPLETE]: ProbeDirectCompleteFields;
  [PROBE_LOG_EVENT.BROWSER_FALLBACK]: ProbeBrowserFallbackFields;
  [PROBE_LOG_EVENT.BROWSER_COMPLETE]: ProbeBrowserCompleteFields;
  [PROBE_LOG_EVENT.FAILED]: ProbeFailedFields;
}

export interface ProbeLogger {
  debug<E extends ProbeLogEvent>(event: E, fields: ProbeEventFields[E]): void;
  info<E extends ProbeLogEvent>(event: E, fields: ProbeEventFields[E]): void;
  warn<E extends ProbeLogEvent>(event: E, fields: ProbeEventFields[E]): void;
  error<E extends ProbeLogEvent>(event: E, fields: ProbeEventFields[E]): void;
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
