import Table from "cli-table3";
import type { WorkflowResult } from "@tariff-radar/probe-core";

/**
 * Compact result table for stdout. One row per seed plus a full-width detail
 * line for errors, so the final record scans at a glance. The live story
 * already printed on stderr; this is the keepable summary.
 */

/**
 * Format all workflow results as an aligned table.
 * @param results - Completed workflow results in run order.
 * @returns Bordered table with one row per seed and detail lines for errors.
 */
export function formatTable(results: WorkflowResult[]): string {
  const table = new Table({
    head: ["ISO", "METHOD", "PROVIDER", "OUTCOME", "EVIDENCE"],
    style: { head: [], border: [] },
  });
  for (const result of results) {
    table.push([
      result.seed.isoCode,
      result.method,
      result.provider ?? "-",
      describeOutcome(result),
      result.evidence.length > 0 ? result.evidence.join(", ") : "none",
    ]);
    const detail = describeDetail(result);
    if (detail !== null) {
      table.push([{ colSpan: 5, content: detail }]);
    }
  }
  return table.toString();
}

/**
 * Render the run outcome in a few words.
 * @param result - Completed workflow result for one seed.
 * @returns The outcome cell text.
 */
function describeOutcome(result: WorkflowResult): string {
  if (result.direct.ok) {
    return `HTTP ${String(result.direct.status)} in ${String(result.direct.latencyMs)}ms`;
  }
  if (result.browser) {
    return result.browser.status !== null ? `HTTP ${String(result.browser.status)}` : "no response";
  }
  return result.error ?? "unknown error";
}

/**
 * Render the worth-keeping detail: a failure reason, if any. Browser page
 * titles stay captured in the result but off the table for now.
 * @param result - Completed workflow result for one seed.
 * @returns An `error:` line, or null when there is nothing to add.
 */
function describeDetail(result: WorkflowResult): string | null {
  if (result.error) {
    return `error: ${result.error}`;
  }
  return null;
}
