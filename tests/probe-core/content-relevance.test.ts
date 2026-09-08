import { describe, expect, it } from "vitest";
import { CONTENT_RELEVANCE_TERM, PROBE_EVIDENCE, assessContentRelevance } from "@tariff-radar/probe-core";

describe("assessContentRelevance", () => {
  it("reports no match for missing observations", () => {
    expect(assessContentRelevance({ title: null, text: null })).toEqual({
      hasRelevantContent: false,
      matchedTerms: [],
      evidence: [],
    });
  });

  it("reports no match for empty observations", () => {
    expect(assessContentRelevance({ title: "", text: "" })).toEqual({
      hasRelevantContent: false,
      matchedTerms: [],
      evidence: [],
    });
  });

  it("reports no match for unrelated content", () => {
    const result = assessContentRelevance({ title: "Welcome", text: "This portal has news and contact details." });
    expect(result.hasRelevantContent).toBe(false);
    expect(result.matchedTerms).toEqual([]);
    expect(result.evidence).toEqual([]);
  });

  it("matches tariff terminology case-insensitively", () => {
    const result = assessContentRelevance({ title: null, text: "TARIFF schedule and tariffs apply." });
    expect(result.hasRelevantContent).toBe(true);
    expect(result.matchedTerms).toEqual([CONTENT_RELEVANCE_TERM.TARIFF]);
    expect(result.evidence).toEqual([PROBE_EVIDENCE.TARIFF_KEYWORD]);
  });

  it("matches customs terminology from the title alone", () => {
    const result = assessContentRelevance({ title: "Japan Customs portal", text: null });
    expect(result.matchedTerms).toEqual([CONTENT_RELEVANCE_TERM.CUSTOMS]);
    expect(result.evidence).toEqual([PROBE_EVIDENCE.CUSTOMS_KEYWORD]);
  });

  it("matches duty and duties spellings", () => {
    expect(assessContentRelevance({ title: null, text: "import duty rates" }).matchedTerms).toEqual([
      CONTENT_RELEVANCE_TERM.DUTY,
    ]);
    expect(assessContentRelevance({ title: null, text: "duties and taxes" }).matchedTerms).toEqual([
      CONTENT_RELEVANCE_TERM.DUTY,
    ]);
  });

  it("matches hs-code variants", () => {
    expect(assessContentRelevance({ title: null, text: "HS code lookup" }).matchedTerms).toEqual([
      CONTENT_RELEVANCE_TERM.HS_CODE,
    ]);
    expect(assessContentRelevance({ title: null, text: "hs-code search" }).matchedTerms).toEqual([
      CONTENT_RELEVANCE_TERM.HS_CODE,
    ]);
    expect(assessContentRelevance({ title: null, text: "Harmonized System chapters" }).matchedTerms).toEqual([
      CONTENT_RELEVANCE_TERM.HS_CODE,
    ]);
    expect(assessContentRelevance({ title: "HTS search", text: null }).matchedTerms).toEqual([
      CONTENT_RELEVANCE_TERM.HS_CODE,
    ]);
  });

  it("combines title and text matches in first-seen term order", () => {
    const result = assessContentRelevance({ title: "Customs duties", text: "Tariff HS code tables and duty rates." });
    expect(result.hasRelevantContent).toBe(true);
    expect(result.matchedTerms).toEqual([
      CONTENT_RELEVANCE_TERM.TARIFF,
      CONTENT_RELEVANCE_TERM.CUSTOMS,
      CONTENT_RELEVANCE_TERM.DUTY,
      CONTENT_RELEVANCE_TERM.HS_CODE,
    ]);
    expect(result.evidence).toEqual([
      PROBE_EVIDENCE.TARIFF_KEYWORD,
      PROBE_EVIDENCE.CUSTOMS_KEYWORD,
      PROBE_EVIDENCE.DUTY_KEYWORD,
      PROBE_EVIDENCE.HS_CODE_KEYWORD,
    ]);
  });

  it("does not match substrings inside unrelated words", () => {
    const result = assessContentRelevance({ title: null, text: "customer duty-freetoplasm" });
    expect(result.matchedTerms).toEqual([CONTENT_RELEVANCE_TERM.DUTY]);
  });
});
