import { PROBE_LOG_EVENT } from "./logger.js";
import type { LogFields, ProbeLogger } from "./logger.js";

/**
 * Pretty progress rendering: one short line per workflow stage. Joins
 * {@link consoleProbeLogger} (machine lines) and {@link noopProbeLogger}
 * (silence) as the third logger in the family. Never renders page contents
 * — the workflow only passes observable metadata.
 */

/**
 * Build a progress logger.
 * @param write - Line sink (stderr in production, an array push in tests).
 * @returns A {@link ProbeLogger} rendering one stage line per event.
 */
export function progressLogger(write: (line: string) => void): ProbeLogger {
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
 * Render the effective opt-in browser capabilities, if any.
 * @param fields - Fallback event fields.
 * @returns ` (stealth, proxy MX, captcha)`-style suffix, or empty.
 */
function describeOptions(fields: LogFields): string {
  const used: string[] = [];
  if (fields.stealth === true) {
    used.push("stealth");
  }
  if (fields.proxyCountry) {
    used.push(`proxy ${String(fields.proxyCountry)}`);
  }
  if (fields.captcha === true) {
    used.push("captcha");
  }
  return used.length > 0 ? ` (${used.join(", ")})` : "";
}

/**
 * Format one workflow event as a single followable line.
 * @param message - Event name from {@link PROBE_LOG_EVENT}.
 * @param fields - Flat event fields.
 * @returns The rendered line.
 */
export function formatStage(message: string, fields: LogFields): string {
  const iso = String(fields.isoCode);
  // LogFields is loosely typed, so narrow before comparing: the workflow
  // always sends a numeric attempts, but the type cannot promise it.
  const tries = typeof fields.attempts === "number" && fields.attempts > 1 ? fields.attempts : 0;
  switch (message) {
    case PROBE_LOG_EVENT.START:
      return `── ${iso} ${String(fields.portalUrl)}`;
    case PROBE_LOG_EVENT.DIRECT_COMPLETE:
      if (fields.ok !== true) {
        const retry = tries > 0 ? ` after ${String(tries)} attempts` : "";
        return `[${iso}] direct: failed${retry} (${String(fields.error ?? "unknown error")})`;
      }
      return `[${iso}] direct: HTTP ${String(fields.status)} in ${String(fields.latencyMs)}ms${tries > 0 ? ` (${String(tries)} attempts)` : ""}`;
    case PROBE_LOG_EVENT.BROWSER_FALLBACK:
      return `[${iso}] browser via ${String(fields.provider)}${describeOptions(fields)}`;
    case PROBE_LOG_EVENT.BROWSER_COMPLETE:
      if (fields.status === null || fields.status === undefined) {
        return `[${iso}] browser: no response`;
      }
      return `[${iso}] browser: HTTP ${String(fields.status)} in ${String(fields.latencyMs)}ms`;
    case PROBE_LOG_EVENT.FAILED:
      return `[${iso}] failed: ${String(fields.error)}`;
    default:
      return message;
  }
}
