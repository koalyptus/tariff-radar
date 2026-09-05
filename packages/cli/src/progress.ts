import { PROBE_LOG_EVENT } from "@tariff-radar/probe-core";
import type { LogFields, ProbeLogger } from "@tariff-radar/probe-core";

/**
 * Human-readable progress rendering for the CLI demo. One short line per
 * workflow stage on stderr, so the run is easy to follow live while the
 * per-seed summaries stay clean on stdout. Never renders page contents —
 * the workflow only passes observable metadata.
 */

/**
 * Build a progress logger.
 * @param write - Line sink (stderr in production, an array push in tests).
 * @returns A {@link ProbeLogger} rendering one stage line per event.
 */
export function humanProbeLogger(write: (line: string) => void): ProbeLogger {
  const render = (message: string, fields?: LogFields): void => {
    write(formatStage(message, fields ?? {}));
  };
  return {
    debug: (message, fields) => {
      render(message, fields);
    },
    info: (message, fields) => {
      render(message, fields);
    },
    warn: (message, fields) => {
      render(message, fields);
    },
    error: (message, fields) => {
      render(message, fields);
    },
  };
}

/**
 * Format one workflow event as a single followable line.
 * @param message - Event name from {@link PROBE_LOG_EVENT}.
 * @param fields - Flat event fields.
 * @returns The rendered line.
 */
export function formatStage(message: string, fields: LogFields): string {
  switch (message) {
    case PROBE_LOG_EVENT.START:
      return `── ${String(fields.isoCode)} ${String(fields.portalUrl)}`;
    case PROBE_LOG_EVENT.DIRECT_COMPLETE:
      if (fields.ok !== true) {
        return `   direct: failed (${String(fields.error ?? "unknown error")})`;
      }
      return `   direct: HTTP ${String(fields.status)} in ${String(fields.latencyMs)}ms`;
    case PROBE_LOG_EVENT.BROWSER_FALLBACK:
      return `   browser via ${String(fields.provider)}…`;
    case PROBE_LOG_EVENT.BROWSER_COMPLETE:
      if (fields.status === null || fields.status === undefined) {
        return "   browser: no response";
      }
      return `   browser: HTTP ${String(fields.status)}`;
    case PROBE_LOG_EVENT.FAILED:
      return `   failed: ${String(fields.error)}`;
    default:
      return message;
  }
}
