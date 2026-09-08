import type { RegistryEntry } from "./types.js";

/**
 * Content-signal evidence keys that keep an entry out of human triage.
 * Values mirror `PROBE_EVIDENCE` keyword entries in `@tariff-radar/probe-core`
 * (`tariff_keyword`, `customs_keyword`, `duty_keyword`, `hs_code_keyword`).
 * Mirrored here as plain strings so `registry` needs no runtime dependency
 * on `probe-core`: the mapper already carries evidence as opaque strings.
 */
export const NEEDS_REVIEW_KEYWORD_EVIDENCE = [
  "tariff_keyword",
  "customs_keyword",
  "duty_keyword",
  "hs_code_keyword",
] as const;

/**
 * Select entries needing human triage. Pure: an entry needs review when the
 * run recorded a terminal error, or when transport succeeded but no
 * content-relevance keyword was observed. Entries stay complete: the full
 * evidence trail is preserved for the reviewer.
 * @param entries - Registry entries in run order.
 * @returns The subset needing review, in the same order.
 */
export function selectNeedsReviewEntries(entries: readonly RegistryEntry[]): RegistryEntry[] {
  return entries.filter((entry) => entry.verification.error !== null || !hasContentSignal(entry.verification.evidence));
}

function hasContentSignal(evidence: readonly string[]): boolean {
  return evidence.some((item) => (NEEDS_REVIEW_KEYWORD_EVIDENCE as readonly string[]).includes(item));
}
