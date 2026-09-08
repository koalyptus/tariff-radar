import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { NEEDS_REVIEW_KEYWORD_EVIDENCE, runWriteNeedsReview, selectNeedsReviewEntries } from "@tariff-radar/registry";
import type { RegistryEntry } from "@tariff-radar/registry";

// Same hermetic default-path redirection as generate.test.ts: the default
// `needs_review.json` branch is covered against a fake tmp dir, so the suite
// never touches the real workspace `data/`.
const workspace = vi.hoisted(() => ({ dir: "" }));

vi.mock("@tariff-radar/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tariff-radar/shared")>();
  if (!workspace.dir) {
    const { mkdtempSync: makeTemp } = await import("node:fs");
    const { tmpdir: osTmp } = await import("node:os");
    const { join: joinPath } = await import("node:path");
    workspace.dir = makeTemp(joinPath(osTmp(), "fake-workspace-"));
  }
  return { ...actual, projectDataDir: () => workspace.dir };
});

afterAll(() => {
  if (workspace.dir) {
    rmSync(workspace.dir, { recursive: true, force: true });
  }
});

function entry(overrides: { evidence?: string[]; error?: string | null; isoCode?: string }): RegistryEntry {
  return {
    isoCode: overrides.isoCode ?? "US",
    countryName: "United States",
    authority: "USITC",
    portalUrl: "https://hts.usitc.gov/",
    sourceUrl: "https://www.usitc.gov/tariff_affairs",
    verification: {
      status: "unverified",
      checkedAt: "2026-01-01T00:00:00.000Z",
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
      evidence: overrides.evidence ?? ["direct_response"],
      error: overrides.error ?? null,
    },
  };
}

describe("selectNeedsReviewEntries", () => {
  it("returns an empty array for no entries", () => {
    expect(selectNeedsReviewEntries([])).toEqual([]);
  });

  it("flags failed runs even when keyword evidence exists", () => {
    const flagged = entry({
      evidence: ["browser_response", "browser_text", "tariff_keyword"],
      error: "stub error",
    });
    expect(selectNeedsReviewEntries([flagged])).toEqual([flagged]);
  });

  it("flags transport-only runs without content signals", () => {
    const flagged = entry({ evidence: ["direct_response"], error: null });
    expect(selectNeedsReviewEntries([flagged])).toEqual([flagged]);
  });

  it("keeps runs with any keyword signal out of triage", () => {
    for (const keyword of NEEDS_REVIEW_KEYWORD_EVIDENCE) {
      const kept = entry({ evidence: ["browser_response", "browser_text", keyword], error: null });
      expect(selectNeedsReviewEntries([kept])).toEqual([]);
    }
  });

  it("preserves run order and the full evidence trail", () => {
    const failing = entry({ isoCode: "US", evidence: [], error: "stub error" });
    const relevant = entry({
      isoCode: "MX",
      evidence: ["browser_response", "browser_text", "customs_keyword"],
      error: null,
    });
    const inconclusive = entry({ isoCode: "JP", evidence: ["direct_response"], error: null });
    expect(selectNeedsReviewEntries([failing, relevant, inconclusive])).toEqual([failing, inconclusive]);
  });
});

describe("runWriteNeedsReview", () => {
  it("writes flagged entries to an explicit path with a triage log line", async () => {
    const dir = mkdtempSync(join(tmpdir(), "write-needs-review-"));
    try {
      const out = join(dir, "needs_review.json");
      const lines: string[] = [];
      const flagged = entry({ evidence: [], error: "stub error" });
      const result = await runWriteNeedsReview([flagged], out, (line) => lines.push(line));
      expect(result).toBe(out);
      const written = JSON.parse(readFileSync(out, "utf8")) as { entries: RegistryEntry[] };
      expect(written.entries).toEqual([flagged]);
      expect(lines).toEqual([`Wrote 1 needs-review entries at ${out}`]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("defaults to the data directory without touching the real workspace", async () => {
    const result = await runWriteNeedsReview([]);
    expect(result).toBe(join(workspace.dir, "needs_review.json"));
    const written = JSON.parse(readFileSync(result, "utf8")) as { entries: unknown[] };
    expect(written.entries).toEqual([]);
  });
});
