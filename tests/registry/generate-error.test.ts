import { existsSync, mkdtempSync, rmSync } from "node:fs";
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

const { runWriteRegistry } = await import("../../packages/registry/src/generate.js");

const seedEntry = {
  isoCode: "US",
  countryName: "United States",
  authority: "USITC",
  portalUrl: "https://hts.usitc.gov/",
  sourceUrl: "https://www.usitc.gov/tariff_affairs",
  verification: {
    status: "unverified" as const,
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
    evidence: ["direct_response"],
    error: null,
  },
};

describe("runWriteRegistry error handling", () => {
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
    const dir = mkdtempSync(join(tmpdir(), "write-registry-err-"));
    const out = join(dir, "registry.json");
    try {
      await expect(runWriteRegistry([seedEntry], out)).rejects.toThrow("rename EPERM");
      const tmpPath = out + ".tmp";
      expect(mockRm).toHaveBeenCalledWith(tmpPath, { force: true });
      expect(existsSync(tmpPath)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not throw when temp cleanup itself fails", async () => {
    const dir = mkdtempSync(join(tmpdir(), "write-registry-err2-"));
    const out = join(dir, "registry.json");
    mockRm.mockRejectedValue(new Error("rm failed"));
    try {
      await expect(runWriteRegistry([seedEntry], out)).rejects.toThrow("rename EPERM");
      expect(mockRm).toHaveBeenCalled();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("attempts cleanup when the file write itself fails", async () => {
    mockWriteFile.mockRejectedValue(new Error("write ENOENT"));
    const dir = mkdtempSync(join(tmpdir(), "write-registry-err3-"));
    const out = join(dir, "registry.json");
    try {
      await expect(runWriteRegistry([seedEntry], out)).rejects.toThrow("write ENOENT");
      expect(mockRm).toHaveBeenCalledWith(out + ".tmp", { force: true });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
