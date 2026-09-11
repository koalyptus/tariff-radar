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
    direct: {
      ok: true,
      status: 200,
      finalUrl: seed.portalUrl,
      latencyMs: 9,
      title: null,
      text: null,
      attempts: 1,
      error: null,
    },
    browser: null,
    evidence: ["direct_response"],
    artifacts: [],
    error: null,
  };
}

function browserResult(): WorkflowResult {
  return {
    seed: { ...seed },
    method: "browser",
    provider: "solari",
    direct: {
      ok: false,
      status: null,
      finalUrl: null,
      latencyMs: 7,
      title: null,
      text: null,
      attempts: 1,
      error: "stub error",
    },
    browser: {
      status: 200,
      finalUrl: seed.portalUrl,
      title: "Tariff",
      text: "x",
      sessionId: "solari-session-1",
      latencyMs: 11,
    },
    evidence: ["browser_response", "browser_text"],
    artifacts: [],
    error: null,
  };
}

function failedResult(): WorkflowResult {
  return {
    seed: { ...seed },
    method: "failed",
    provider: null,
    direct: {
      ok: false,
      status: null,
      finalUrl: null,
      latencyMs: 7,
      title: null,
      text: null,
      attempts: 1,
      error: "stub error",
    },
    browser: null,
    evidence: [],
    artifacts: [],
    error: "stub error",
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
      browserSessionId: null,
      artifactCount: 0,
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
      directError: "stub error",
      browserStatus: 200,
      browserFinalUrl: seed.portalUrl,
      browserTitle: "Tariff",
      browserLatencyMs: 11,
      browserSessionId: "solari-session-1",
      artifactCount: 0,
      evidence: ["browser_response", "browser_text"],
      error: null,
    });
  });

  it("maps failed results with error recorded, never claiming verification", () => {
    const checkedAt = "2026-01-01T00:00:00.000Z";
    const entries = mapWorkflowResultsToEntries([failedResult()], checkedAt);
    const entry = entries[0]!;
    expect(entry.verification.method).toBe("failed");
    expect(entry.verification.error).toBe("stub error");
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

  it("counts retrieved artifacts without embedding their bytes", () => {
    const result = directResult();
    result.artifacts = [
      {
        sourceUrl: "https://cdn.example/schedule.pdf",
        buffer: Buffer.from([1, 2, 3]),
        contentType: "application/pdf",
        contentLength: 3,
        textLayer: false,
        provider: null,
        retrievedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const entries = mapWorkflowResultsToEntries([result], "2026-01-01T00:00:00.000Z");
    expect(entries[0]!.verification.artifactCount).toBe(1);
    expect(JSON.stringify(entries[0])).not.toContain("schedule.pdf");
  });
});
