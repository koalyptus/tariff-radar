import type { WorkflowResult } from "@tariff-radar/probe-core";

/**
 * Human-readable one-run summary for stdout. Pure formatting: the entry
 * script prints the returned string without adding its own layout.
 */

/**
 * Format one workflow result as a short multi-line summary.
 * @param result - Completed workflow result for one seed.
 * @returns Lines a contributor can scan without reading logs.
 */
export function formatSummary(result: WorkflowResult): string {
  const lines = [
    `${result.seed.isoCode} ${result.seed.countryName} <${result.seed.portalUrl}>`,
    `method: ${result.method}${result.provider ? ` provider: ${result.provider}` : ""}`,
    result.direct.ok
      ? `direct: HTTP ${String(result.direct.status)} in ${String(result.direct.latencyMs)}ms`
      : `direct: failed (${result.direct.error ?? "unknown error"})`,
  ];
  if (result.browser) {
    const where = result.browser.finalUrl ?? "unknown url";
    if (result.browser.status !== null) {
      lines.push(`browser: HTTP ${String(result.browser.status)} at ${where}`);
    } else {
      lines.push(`browser: no response at ${where}`);
    }
    if (result.browser.title) {
      lines.push(`title: ${result.browser.title}`);
    }
  }
  lines.push(`evidence: ${result.evidence.length > 0 ? result.evidence.join(", ") : "none"}`);
  if (result.error) {
    lines.push(`error: ${result.error}`);
  }
  return lines.join("\n");
}
