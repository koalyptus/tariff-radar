import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ArtifactRecord, WorkflowResult } from "@tariff-radar/probe-core";
import { ARTIFACT_MANIFEST_FILE_NAME, runStoreArtifacts } from "@tariff-radar/registry";
import type { ArtifactManifest } from "@tariff-radar/registry";

const seed = {
  isoCode: "US",
  countryName: "United States",
  authority: "USITC",
  portalUrl: "https://hts.usitc.gov/",
  sourceUrl: "https://www.usitc.gov/tariff_affairs",
};

function artifactRecord(overrides: Partial<ArtifactRecord> = {}): ArtifactRecord {
  return {
    sourceUrl: "https://cdn.example/schedule.pdf",
    buffer: Buffer.from([1, 2, 3]),
    contentType: "application/pdf",
    contentLength: 3,
    textLayer: false,
    provider: null,
    retrievedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function workflowResult(isoCode: string, artifacts: ArtifactRecord[]): WorkflowResult {
  return {
    seed: { ...seed, isoCode },
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
    artifacts,
    error: null,
  };
}

function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "store-artifacts-"));
  return run(dir).finally(() => {
    rmSync(dir, { recursive: true, force: true });
  });
}

function readManifest(dir: string): ArtifactManifest {
  return JSON.parse(readFileSync(join(dir, ARTIFACT_MANIFEST_FILE_NAME), "utf8")) as ArtifactManifest;
}

describe("runStoreArtifacts", () => {
  it("stores bytes under a hashed path and traces them in the manifest", async () => {
    await withTempDir(async (dir) => {
      const stored = await runStoreArtifacts([workflowResult("US", [artifactRecord()])], dir);
      expect(stored.fileCount).toBe(1);
      expect(stored.manifestPath).toBe(join(dir, ARTIFACT_MANIFEST_FILE_NAME));
      const manifest = readManifest(dir);
      expect(manifest.schemaVersion).toBe(1);
      expect(typeof manifest.generatedAt).toBe("string");
      expect(manifest.artifacts).toHaveLength(1);
      const entry = manifest.artifacts[0]!;
      const sha256 = createHash("sha256")
        .update(Buffer.from([1, 2, 3]))
        .digest("hex");
      expect(entry).toEqual({
        isoCode: "US",
        sourceUrl: "https://cdn.example/schedule.pdf",
        path: join("artifacts", "US", `${sha256}.pdf`),
        sha256,
        bytes: 3,
        contentType: "application/pdf",
        textLayer: false,
        provider: null,
        retrievedAt: "2026-01-01T00:00:00.000Z",
      });
      expect(readFileSync(join(dir, entry.path))).toEqual(Buffer.from([1, 2, 3]));
    });
  });

  it("maps content types to file extensions", async () => {
    const cases: Array<[string, string]> = [
      ["application/pdf", "pdf"],
      ["application/pdf; charset=binary", "pdf"],
      ["application/vnd.ms-excel", "xls"],
      ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"],
      ["text/csv", "csv"],
      ["application/zip", "zip"],
    ];
    await withTempDir(async (dir) => {
      for (const [contentType, extension] of cases) {
        const { manifestPath } = await runStoreArtifacts(
          [workflowResult("US", [artifactRecord({ contentType, sourceUrl: "https://cdn.example/download" })])],
          dir,
        );
        expect(manifestPath).toBe(join(dir, ARTIFACT_MANIFEST_FILE_NAME));
        const [entry] = readManifest(dir).artifacts;
        expect(entry!.path.endsWith(`.${extension}`)).toBe(true);
      }
    });
  });

  it("falls back to the source URL extension, then to a binary extension", async () => {
    await withTempDir(async (dir) => {
      const stored = await runStoreArtifacts(
        [
          workflowResult("MX", [
            artifactRecord({ contentType: "", sourceUrl: "https://cdn.example/RATES.XLSX" }),
            artifactRecord({
              contentType: "application/octet-stream",
              sourceUrl: "https://cdn.example/notes.csv?version=2",
              buffer: Buffer.from([4]),
              contentLength: 1,
            }),
            artifactRecord({
              contentType: "",
              sourceUrl: "https://cdn.example/getDocumentFile",
              buffer: Buffer.from([5]),
              contentLength: 1,
            }),
          ]),
        ],
        dir,
      );
      expect(stored.fileCount).toBe(3);
      const [xlsx, csv, bin] = readManifest(dir).artifacts;
      expect(xlsx!.path.endsWith(".xlsx")).toBe(true);
      expect(csv!.path.endsWith(".csv")).toBe(true);
      expect(bin!.path.endsWith(".bin")).toBe(true);
      for (const entry of [xlsx!, csv!, bin!]) {
        expect(entry.isoCode).toBe("MX");
        expect(existsSync(join(dir, entry.path))).toBe(true);
      }
    });
  });

  it("writes an empty manifest when no run retrieved documents", async () => {
    await withTempDir(async (dir) => {
      const stored = await runStoreArtifacts([workflowResult("US", [])], dir);
      expect(stored).toEqual({ manifestPath: join(dir, ARTIFACT_MANIFEST_FILE_NAME), fileCount: 0 });
      expect(readManifest(dir).artifacts).toEqual([]);
    });
  });

  it("separates seeds into ISO directories", async () => {
    await withTempDir(async (dir) => {
      await runStoreArtifacts(
        [workflowResult("US", [artifactRecord()]), workflowResult("MX", [artifactRecord()])],
        dir,
      );
      const manifest = readManifest(dir);
      expect(manifest.artifacts.map((entry) => entry.isoCode)).toEqual(["US", "MX"]);
      expect(manifest.artifacts[0]!.path).not.toBe(manifest.artifacts[1]!.path);
    });
  });
});
