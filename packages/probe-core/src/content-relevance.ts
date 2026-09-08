import { PROBE_EVIDENCE } from "./constants.js";

/**
 * Stable content-relevance term identifiers. These are fixed vocabulary keys,
 * never raw page snippets, so evidence stays reviewable without storing page
 * contents in logs or registry records.
 */
export const CONTENT_RELEVANCE_TERM = {
  TARIFF: "tariff",
  CUSTOMS: "customs",
  DUTY: "duty",
  HS_CODE: "hs-code",
} as const;

/** One of the {@link CONTENT_RELEVANCE_TERM} values. */
export type ContentRelevanceTerm = (typeof CONTENT_RELEVANCE_TERM)[keyof typeof CONTENT_RELEVANCE_TERM];

/** Observed page signals available for a content-relevance check. */
export interface ContentRelevanceInput {
  /** Rendered page title, or null when no browser observation exists. */
  title: string | null;
  /** Extracted body text, or null when no browser observation exists. */
  text: string | null;
}

/** Outcome of a content-relevance check. Pure and deterministic. */
export interface ContentRelevanceResult {
  /** True when at least one tariff-domain term was observed. */
  hasRelevantContent: boolean;
  /** Stable term identifiers matched, in first-seen order. */
  matchedTerms: ContentRelevanceTerm[];
  /** Evidence keys for the matches, in the same order. */
  evidence: string[];
}

interface TermPattern {
  term: ContentRelevanceTerm;
  evidence: string;
  pattern: RegExp;
}

/**
 * Curated content-relevance patterns. This list is a reviewed heuristic, not
 * an exhaustive taxonomy: each family below names why it is here and where it
 * can misfire. English only (see limits on {@link assessContentRelevance});
 * seed-language coverage was deliberately deferred, not overlooked.
 */
const TERM_PATTERNS: readonly TermPattern[] = [
  // The project's core domain noun: every seed is a tariff-portal candidate,
  // so a landing page naming tariffs is weak but direct content evidence.
  { term: CONTENT_RELEVANCE_TERM.TARIFF, evidence: PROBE_EVIDENCE.TARIFF_KEYWORD, pattern: /\btariffs?\b/i },
  // The owning authority type: all eight seeds are customs administrations.
  // Matches bare "custom" too — known over-match (e.g. "custom search"),
  // accepted because customs pages routinely write "custom" attributively.
  // Word boundaries keep "customer" out.
  { term: CONTENT_RELEVANCE_TERM.CUSTOMS, evidence: PROBE_EVIDENCE.CUSTOMS_KEYWORD, pattern: /\bcustoms?\b/i },
  // The charge itself: "duty"/"duties" is standard customs vocabulary
  // (e.g. "duty rates", "duty-free"). No verb sense collides at a word
  // boundary in portal copy.
  { term: CONTENT_RELEVANCE_TERM.DUTY, evidence: PROBE_EVIDENCE.DUTY_KEYWORD, pattern: /\bdut(?:y|ies)\b/i },
  {
    // The most standard-grounded family: the WCO Harmonized System is the
    // international goods-classification standard behind tariff schedules;
    // HTS is the US Harmonized Tariff Schedule. Any one spelling counts.
    term: CONTENT_RELEVANCE_TERM.HS_CODE,
    evidence: PROBE_EVIDENCE.HS_CODE_KEYWORD,
    pattern: /\bhs\s*-?\s*codes?\b|\bharmonized\s+system\b|\bhts\b/i,
  },
];

/**
 * Check observed browser text and title for tariff-domain terminology.
 * English keywords only; absence of a match never means the portal lacks
 * tariff content, only that this run observed none. Transport success alone
 * never counts: null or empty inputs yield no match.
 * @param input - Observed title and body text (never page contents logging).
 * @returns Matched stable term identifiers with their evidence keys.
 */
export function assessContentRelevance(input: ContentRelevanceInput): ContentRelevanceResult {
  const haystack = `${input.title ?? ""}\n${input.text ?? ""}`;
  const matchedTerms: ContentRelevanceTerm[] = [];
  const evidence: string[] = [];
  for (const candidate of TERM_PATTERNS) {
    if (candidate.pattern.test(haystack)) {
      matchedTerms.push(candidate.term);
      evidence.push(candidate.evidence);
    }
  }
  return { hasRelevantContent: matchedTerms.length > 0, matchedTerms, evidence };
}
