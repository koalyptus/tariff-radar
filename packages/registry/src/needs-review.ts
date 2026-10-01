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
 * Evidence key marking observed-but-unretrieved document links. Mirrors
 * `PROBE_EVIDENCE.DOCUMENT_LINK` as a plain string for the same
 * dependency-free reason as {@link NEEDS_REVIEW_KEYWORD_EVIDENCE}.
 */
export const NEEDS_REVIEW_DOCUMENT_LINK_EVIDENCE = "document_link";

/**
 * Select entries needing human triage. Pure: an entry needs review when the
 * run recorded a terminal error, when transport succeeded but no
 * content-relevance keyword was observed, or when document links were
 * observed but neither path retrieved them (guarded endpoints worth a
 * human look). Entries stay complete: the full evidence trail is preserved
 * for the reviewer.
 * @param entries - Registry entries in run order.
 * @returns The subset needing review, in the same order.
 */
export function selectNeedsReviewEntries(entries: readonly RegistryEntry[]): RegistryEntry[] {
  return entries.filter(
    (entry) =>
      entry.verification.error !== null ||
      !hasContentSignal(entry.verification.evidence) ||
      hasUnretrievedDocuments(entry.verification),
  );
}

function hasContentSignal(evidence: readonly string[]): boolean {
  return evidence.some((item) => (NEEDS_REVIEW_KEYWORD_EVIDENCE as readonly string[]).includes(item));
}

/**
 * Decide whether a run saw documents it could not bring home.
 * @param verification - Registry verification record for one run.
 * @returns True when links were observed but the artifact count is zero.
 */
function hasUnretrievedDocuments(verification: RegistryEntry["verification"]): boolean {
  return verification.artifactCount === 0 && verification.evidence.includes(NEEDS_REVIEW_DOCUMENT_LINK_EVIDENCE);
}
