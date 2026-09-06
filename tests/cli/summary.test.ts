import { describe, expect, it } from "vitest";
import type { WorkflowResult } from "@tariff-radar/probe-core";
import type { Seed } from "@tariff-radar/registry";
import { formatTable } from "@tariff-radar/cli";

const seedUS: Seed = {
  isoCode: "US",
  countryName: "United States",
  authority: "USITC",
  portalUrl: "https://hts.usitc.gov/",
  sourceUrl: "https://www.usitc.gov/tariff_affairs",
};

const seedMX: Seed = {
  isoCode: "MX",
  countryName: "Mexico",
  authority: "Secretaria de Economia",
  portalUrl: "https://www.snice.gob.mx/",
  sourceUrl: "https://www.gob.mx/se/snice",
};

function directOk() {
  return {
    ok: true,
    status: 200,
    finalUrl: "https://hts.usitc.gov/",
    latencyMs: 42,
    title: null,
    error: null,
  };
}

function directFailed(error: string | null) {
  return { ok: false, status: null, finalUrl: null, latencyMs: 7, title: null, error };
}

function workflowResult(partial: Partial<WorkflowResult> & { seed: WorkflowResult["seed"] }): WorkflowResult {
  return {
    method: "direct",
    provider: null,
    direct: directOk(),
    browser: null,
    evidence: ["direct_response"],
    error: null,
    ...partial,
  };
}

describe("formatTable", () => {
  it("renders one row per seed with error details", () => {
    const text = formatTable([
      workflowResult({ seed: seedUS }),
      workflowResult({
        seed: seedMX,
        method: "browser",
        provider: "solari",
        direct: directFailed("connection refused"),
        browser: {
          status: 200,
          finalUrl: "https://www.snice.gob.mx/final",
          title: "SNICE",
          text: "arancel",
          latencyMs: 812,
        },
        evidence: ["browser_response", "browser_text"],
      }),
      workflowResult({
        seed: seedUS,
        method: "failed",
        direct: directFailed(null),
        evidence: [],
        error: "direct probe failed and no browser provider was configured",
      }),
    ]);
    for (const cell of [
      "ISO",
      "METHOD",
      "PROVIDER",
      "OUTCOME",
      "EVIDENCE",
      "US",
      "direct",
      "HTTP 200 in 42ms",
      "direct_response",
      "MX",
      "browser",
      "solari",
      "HTTP 200 in 812ms",
      "browser_response, browser_text",
      "failed",
      "none",
      "error: direct probe failed and no browser provider was configured",
    ]) {
      expect(text).toContain(cell);
    }
  });

  it("renders a browser run with no observed response", () => {
    const text = formatTable([
      workflowResult({
        seed: seedUS,
        method: "browser",
        provider: "solari",
        direct: directFailed("timeout"),
        browser: { status: null, finalUrl: null, title: null, text: "body", latencyMs: 96 },
        evidence: ["browser_text"],
      }),
    ]);
    expect(text).toContain("no response");
    expect(text).not.toContain("title:");
  });

  it("renders an unknown failure without a recorded error", () => {
    const text = formatTable([workflowResult({ seed: seedUS, method: "failed", direct: directFailed(null) })]);
    expect(text).toContain("unknown error");
  });
});
