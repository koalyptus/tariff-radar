import type { DirectProbeResult } from "./index.js";

/** Bounded wait for one direct HTTP attempt. */
export const DEFAULT_DIRECT_PROBE_TIMEOUT_MS = 10_000;

/** Direct attempts per probe: one try plus two retries for flaky edges. */
export const DEFAULT_DIRECT_PROBE_ATTEMPTS = 3;

/** Upper bound on captured body characters: a memory/regex bound, not a semantic one. */
export const DIRECT_PROBE_MAX_BODY_CHARS = 256_000;

/** Error message when probing is disabled before any attempt. */
export const NO_ATTEMPTS_MESSAGE = "no attempts made";

/**
 * Bot User-Agent for direct probes, identifying the client honestly rather
 * than impersonating a browser. Kept bare on purpose: no contact URL to
 * maintain, no version theater.
 */
export const DIRECT_PROBE_USER_AGENT = "TariffRadar/1.0";

/** Shared defaults for every direct-probe outcome; call sites spread and override. */
const initialProbeResult: DirectProbeResult = {
  ok: false,
  status: null,
  finalUrl: null,
  latencyMs: 0,
  title: null,
  text: null,
  attempts: 0,
  error: null,
};

/**
 * Probe a URL with native `fetch` under a bounded timeout, retrying failed
 * attempts for flaky edges. Never throws: timeouts, network errors, and
 * non-2xx statuses fold into the returned result. A 2xx response alone never
 * means verified. Successful textual bodies are captured (capped) for
 * content checks; binary bodies and body-read failures yield null text
 * without revoking the transport success.
 * @param url - Candidate portal URL to request.
 * @param timeoutMs - Abort threshold per attempt; defaults to
 * {@link DEFAULT_DIRECT_PROBE_TIMEOUT_MS}.
 * @param maxAttempts - Total attempts including retries; defaults to
 * {@link DEFAULT_DIRECT_PROBE_ATTEMPTS}.
 * @returns The observed outcome, including total latency and attempt count.
 */
export async function runDirectProbe(
  url: string,
  timeoutMs = DEFAULT_DIRECT_PROBE_TIMEOUT_MS,
  maxAttempts = DEFAULT_DIRECT_PROBE_ATTEMPTS,
): Promise<DirectProbeResult> {
  // Monotonic clock: wall time can jump backwards (NTP resync, VM drift),
  // which once produced negative latencies in the evidence.
  const startedAt = performance.now();
  let attempts = 0;
  let lastError: string | null = null;

  while (attempts < maxAttempts) {
    attempts += 1;
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "User-Agent": DIRECT_PROBE_USER_AGENT },
      });
      const ok = response.ok;
      return {
        ...initialProbeResult,
        ok,
        status: response.status,
        finalUrl: response.url,
        latencyMs: Math.round(performance.now() - startedAt),
        attempts,
        text: ok ? await readBodyText(response) : null,
        error: ok ? null : `HTTP ${response.status}`,
      };
    } catch (error) {
      lastError = describeError(error, timeoutMs);
    }
  }

  if (attempts === 0) {
    return {
      ...initialProbeResult,
      latencyMs: Math.round(performance.now() - startedAt),
      attempts,
      error: NO_ATTEMPTS_MESSAGE,
    };
  }

  return {
    ...initialProbeResult,
    latencyMs: Math.round(performance.now() - startedAt),
    attempts,
    error: lastError,
  };
}

/**
 * Read a successful response body for content checks. Textual bodies only
 * (missing content-type counts as textual); binary bodies are skipped rather
 * than decoded into garbage. Never throws: a body-read failure yields null
 * so transport success is never revoked by it.
 * @param response - Successful fetch response.
 * @returns The body capped at {@link DIRECT_PROBE_MAX_BODY_CHARS}, or null.
 */
async function readBodyText(response: Response): Promise<string | null> {
  const contentType = response.headers?.get("content-type") ?? "";
  if (!isTextualContent(contentType)) {
    return null;
  }
  try {
    return (await response.text()).slice(0, DIRECT_PROBE_MAX_BODY_CHARS);
  } catch {
    return null;
  }
}

/**
 * Decide whether a body is worth scanning. Deliberately narrow: markup, text,
 * and data serializations only. Anything else (PDF, images, archives) skips
 * the scan instead of matching word boundaries against decoded noise.
 * @param contentType - Raw `content-type` header value, possibly empty.
 * @returns True for textual bodies, including a missing content-type.
 */
function isTextualContent(contentType: string): boolean {
  return contentType === "" || /text|html|json|xml/i.test(contentType);
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
