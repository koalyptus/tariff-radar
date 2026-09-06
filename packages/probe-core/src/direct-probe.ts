import type { DirectProbeResult } from "./index.js";

/** Bounded wait for one direct HTTP attempt. */
export const DEFAULT_DIRECT_PROBE_TIMEOUT_MS = 10_000;

/**
 * Probe a URL with a single native `fetch` under a bounded timeout. Never
 * throws: timeouts, network errors, and non-2xx statuses fold into the
 * returned result. A 2xx response alone never means verified.
 * @param url - Candidate portal URL to request.
 * @param timeoutMs - Abort threshold; defaults to {@link DEFAULT_DIRECT_PROBE_TIMEOUT_MS}.
 * @returns The observed outcome, including latency on every path.
 */
export async function runDirectProbe(
  url: string,
  timeoutMs = DEFAULT_DIRECT_PROBE_TIMEOUT_MS,
): Promise<DirectProbeResult> {
  // Monotonic clock: wall time can jump backwards (NTP resync, VM drift),
  // which once produced negative latencies in the evidence.
  const startedAt = performance.now();

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return {
      ok: response.ok,
      status: response.status,
      finalUrl: response.url,
      latencyMs: Math.round(performance.now() - startedAt),
      title: null,
      error: response.ok ? null : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      finalUrl: null,
      latencyMs: Math.round(performance.now() - startedAt),
      title: null,
      error: describeError(error, timeoutMs),
    };
  }
}

/**
 * Render a fetch failure specifically. Undici wraps network failures in a
 * generic `fetch failed` TypeError and hides the cause (DNS, refused,
 * timeout) behind `cause` chains and `AggregateError` attempt lists (one
 * entry per happy-eyeballs try) — surfacing the first specific message is
 * the difference between `direct: failed (fetch failed)` and knowing the
 * portal never resolved. Never returns empty: an anonymous failure still
 * names itself.
 * @param error - Rejection reason from `fetch`.
 * @param timeoutMs - Abort threshold, for naming timeouts honestly.
 * @returns The specific failure reason.
 */
function describeError(error: unknown, timeoutMs: number): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError") {
      return `timeout after ${String(timeoutMs)}ms`;
    }
    const specific = specificMessage(error);
    if (specific) {
      return specific;
    }
    return `fetch failed (${String(error.cause ?? "unknown reason")})`;
  }
  return String(error);
}

/**
 * Find the first non-empty message walking `AggregateError` attempt lists
 * and `cause` chains.
 * @param error - Error to look inside.
 * @returns The specific message, or null when nothing names the failure.
 */
function specificMessage(error: Error): string | null {
  const nested = error instanceof AggregateError ? error.errors : error.cause === undefined ? [] : [error.cause];
  for (const sub of nested) {
    const inner = sub instanceof Error ? specificMessage(sub) : String(sub);
    if (inner) {
      return inner;
    }
  }
  return error.message || null;
}
