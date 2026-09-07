import { describe, expect, it } from "vitest";
import type { WorkflowResult } from "@tariff-radar/probe-core";
import { mapWorkflowResultsToEntries, REGISTRY_VERIFICATION_STATUS } from "@tariff-radar/registry";

const seed = {
  isoCode: "US",
  countryName: "United States",
  authority: "USITC",
  portalUrl: "https://hts.usitc.gov/",
  sourceUrl: "https://www.usitc.gov/tariff_affairs",
};

function directResult(): WorkflowResult {
  return {
    seed: { ...seed },
    method: "direct",
    provider: null,
    direct: { ok: true, status: 200, finalUrl: seed.portalUrl, latencyMs: 9, title: null, attempts: 1, error: null },
    browser: null,
    evidence: ["direct_response"],
    error: null,
  };
}

function browserResult(): WorkflowResult {
  return {
    seed: { ...seed },
    method: "browser",
    provider: "solari",
    direct: { ok: false, status: null, finalUrl: null, latencyMs: 7, title: null, attempts: 1, error: "nope" },
    browser: { status: 200, finalUrl: seed.portalUrl, title: "Tariff", text: "x", latencyMs: 11 },
    evidence: ["browser_response", "browser_text"],
    error: null,
  };
}

function failedResult(): WorkflowResult {
  return {
    seed: { ...seed },
    method: "failed",
    provider: null,
    direct: { ok: false, status: null, finalUrl: null, latencyMs: 7, title: null, attempts: 1, error: "nope" },
    browser: null,
    evidence: [],
    error: "nope",
  };
}

describe("mapWorkflowResultsToEntries", () => {
  it("maps direct results with provenance and evidence", () => {
    const checkedAt = "2026-01-01T00:00:00.000Z";
    const entries = mapWorkflowResultsToEntries([directResult()], checkedAt);
    expect(entries).toHaveLength(1);
    const entry = entries[0]!;
    expect(entry).toMatchObject(seed);
    expect(entry.verification).toEqual({
      status: REGISTRY_VERIFICATION_STATUS,
      checkedAt,
      method: "direct",
      provider: null,
      directStatus: 200,
      directLatencyMs: 9,
      directAttempts: 1,
      directError: null,
      browserStatus: null,
      browserFinalUrl: null,
      browserTitle: null,
      browserLatencyMs: null,
      evidence: ["direct_response"],
      error: null,
    });
  });

  it("maps browser results with provider and browser observation", () => {
    const checkedAt = "2026-01-01T00:00:00.000Z";
    const entries = mapWorkflowResultsToEntries([browserResult()], checkedAt);
    const entry = entries[0]!;
    expect(entry.verification).toEqual({
      status: REGISTRY_VERIFICATION_STATUS,
      checkedAt,
      method: "browser",
      provider: "solari",
      directStatus: null,
      directLatencyMs: 7,
      directAttempts: 1,
      directError: "nope",
      browserStatus: 200,
      browserFinalUrl: seed.portalUrl,
      browserTitle: "Tariff",
      browserLatencyMs: 11,
      evidence: ["browser_response", "browser_text"],
      error: null,
    });
  });

  it("maps failed results with error recorded, never claiming verification", () => {
    const checkedAt = "2026-01-01T00:00:00.000Z";
    const entries = mapWorkflowResultsToEntries([failedResult()], checkedAt);
    const entry = entries[0]!;
    expect(entry.verification.method).toBe("failed");
    expect(entry.verification.error).toBe("nope");
    expect(entry.verification.evidence).toEqual([]);
    expect(entry.verification.status).toBe(REGISTRY_VERIFICATION_STATUS);
  });

  it("preserves seed provenance including authority", () => {
    const entries = mapWorkflowResultsToEntries([directResult()], "2026-01-01T00:00:00.000Z");
    expect(entries[0]).toMatchObject(seed);
  });

  it("returns an empty array for no results", () => {
    expect(mapWorkflowResultsToEntries([], "2026-01-01T00:00:00.000Z")).toEqual([]);
  });
});
