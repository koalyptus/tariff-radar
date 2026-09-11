import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRename = vi.fn();
const mockMkdir = vi.fn();
const mockWriteFile = vi.fn();
const mockRm = vi.fn();

// Hoisted mock of node:fs/promises so we can drive failure paths.
vi.mock("node:fs/promises", () => ({
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  rename: (...args: unknown[]) => mockRename(...args),
  rm: (...args: unknown[]) => mockRm(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
}));

const { runStoreArtifacts } = await import("@tariff-radar/registry");

const result = {
  seed: {
    isoCode: "US",
    countryName: "United States",
    authority: "USITC",
    portalUrl: "https://hts.usitc.gov/",
    sourceUrl: "https://www.usitc.gov/tariff_affairs",
  },
  method: "direct",
  provider: null,
  direct: {
    ok: true,
    status: 200,
    finalUrl: "https://hts.usitc.gov/",
    latencyMs: 9,
    title: null,
    text: null,
    attempts: 1,
    error: null,
  },
  browser: null,
  evidence: ["direct_response"],
  artifacts: [
    {
      sourceUrl: "https://cdn.example/schedule.pdf",
      buffer: Buffer.from([1, 2, 3]),
      contentType: "application/pdf",
      contentLength: 3,
      textLayer: false,
      provider: null,
      retrievedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  error: null,
};

describe("runStoreArtifacts error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockRename.mockRejectedValue(new Error("rename EPERM"));
    mockRm.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("cleans up the temp file when rename fails and rethrows the error", async () => {
    const dir = mkdtempSync(join(tmpdir(), "store-artifacts-err-"));
    try {
      await expect(runStoreArtifacts([result], dir)).rejects.toThrow("rename EPERM");
      expect(mockRm).toHaveBeenCalled();
      const [[tmpPath, options]] = mockRm.mock.calls as Array<[string, { force: boolean }]>;
      expect(tmpPath.endsWith(".tmp")).toBe(true);
      expect(options).toEqual({ force: true });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not throw when temp cleanup itself fails", async () => {
    const dir = mkdtempSync(join(tmpdir(), "store-artifacts-err2-"));
    mockRm.mockRejectedValue(new Error("rm failed"));
    try {
      await expect(runStoreArtifacts([result], dir)).rejects.toThrow("rename EPERM");
      expect(mockRm).toHaveBeenCalled();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
