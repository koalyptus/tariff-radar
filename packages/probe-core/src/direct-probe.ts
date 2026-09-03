import type { DirectProbeResult } from "./index.js"

export const DEFAULT_DIRECT_PROBE_TIMEOUT_MS = 10_000

export async function runDirectProbe(
  url: string,
  timeoutMs = DEFAULT_DIRECT_PROBE_TIMEOUT_MS,
): Promise<DirectProbeResult> {
  const startedAt = Date.now()

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    return {
      ok: response.ok,
      status: response.status,
      finalUrl: response.url,
      latencyMs: Date.now() - startedAt,
      title: null,
      error: response.ok ? null : `HTTP ${response.status}`,
    }
  } catch (error) {
    return {
      ok: false,
      status: null,
      finalUrl: null,
      latencyMs: Date.now() - startedAt,
      title: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
