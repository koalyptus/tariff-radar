export type ProbeLogFields = Record<string, string | number | boolean | null | undefined>;

export interface ProbeLogger {
  debug(message: string, fields?: ProbeLogFields): void;
  info(message: string, fields?: ProbeLogFields): void;
  warn(message: string, fields?: ProbeLogFields): void;
  error(message: string, fields?: ProbeLogFields): void;
}

export const PROBE_LOG_EVENT = {
  START: "probe.start",
  DIRECT_COMPLETE: "probe.direct.complete",
  BROWSER_FALLBACK: "probe.browser.fallback",
  BROWSER_COMPLETE: "probe.browser.complete",
  FAILED: "probe.failed",
} as const;

export type ProbeLogEvent = (typeof PROBE_LOG_EVENT)[keyof typeof PROBE_LOG_EVENT];

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
