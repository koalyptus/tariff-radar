import type { WorkflowResult } from "@tariff-radar/probe-core";

/**
 * Compact result table for stdout. One row per seed plus a detail line for
 * titles and errors, so the final record scans at a glance. The live story
 * already printed on stderr; this is the keepable summary.
 */

/** One rendered row with its optional detail line. */
interface TableRow {
  iso: string;
  method: string;
  provider: string;
  outcome: string;
  evidence: string;
  detail: string | null;
}

/**
 * Format all workflow results as an aligned table.
 * @param results - Completed workflow results in run order.
 * @returns Header, one row per seed, and detail lines for titles/errors.
 */
export function formatTable(results: WorkflowResult[]): string {
  const rows = results.map(toRow);
  const isoWidth = width(rows, "iso", "ISO");
  const methodWidth = width(rows, "method", "METHOD");
  const providerWidth = width(rows, "provider", "PROVIDER");
  const outcomeWidth = width(rows, "outcome", "OUTCOME");
  const pad = (row: TableRow): string =>
    [
      row.iso.padEnd(isoWidth),
      row.method.padEnd(methodWidth),
      row.provider.padEnd(providerWidth),
      row.outcome.padEnd(outcomeWidth),
      row.evidence,
    ].join("  ");
  const lines = [
    pad({ iso: "ISO", method: "METHOD", provider: "PROVIDER", outcome: "OUTCOME", evidence: "EVIDENCE", detail: null }),
  ];
  for (const row of rows) {
    lines.push(pad(row));
    if (row.detail !== null) {
      lines.push(`    ${row.detail}`);
    }
  }
  return lines.join("\n");
}

/**
 * Widest cell for one column, never narrower than its header.
 * @param rows - Rendered rows.
 * @param key - Column to measure.
 * @param header - Column header text.
 * @returns The column width.
 */
function width(rows: TableRow[], key: "iso" | "method" | "provider" | "outcome", header: string): number {
  return Math.max(header.length, ...rows.map((row) => row[key].length));
}

/**
 * Render one result as a table row.
 * @param result - Completed workflow result for one seed.
 * @returns The row cells plus a title/error detail line, if any.
 */
function toRow(result: WorkflowResult): TableRow {
  return {
    iso: result.seed.isoCode,
    method: result.method,
    provider: result.provider ?? "-",
    outcome: describeOutcome(result),
    evidence: result.evidence.length > 0 ? result.evidence.join(", ") : "none",
    detail: describeDetail(result),
  };
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
 * Render the worth-keeping detail: a browser page title or a failure reason.
 * @param result - Completed workflow result for one seed.
 * @returns A `title:`/`error:` line, or null when there is nothing to add.
 */
function describeDetail(result: WorkflowResult): string | null {
  if (result.browser?.title) {
    return `title: ${result.browser.title}`;
  }
  if (result.error) {
    return `error: ${result.error}`;
  }
  return null;
}
