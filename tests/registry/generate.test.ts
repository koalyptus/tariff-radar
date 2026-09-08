import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { runWriteRegistry } from "../../packages/registry/src/generate.js";
import type { RegistryEntry } from "../../packages/registry/src/types.js";

// Hermetic default-path coverage: the tests below exercise the
// no-explicit-path branch, but `projectDataDir` is redirected to a fake tmp
// dir so the suite never touches the real workspace `data/` — not even with
// backup/restore, which still leaks on crash or interrupt.
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

const seed: RegistryEntry = {
  isoCode: "US",
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
    evidence: ["direct_response"],
    error: null,
  },
};

describe("runWriteRegistry", () => {
  it("writes entries to an explicit path", async () => {
    const dir = mkdtempSync(join(tmpdir(), "write-registry-"));
    try {
      const out = join(dir, "registry.json");
      const result = await runWriteRegistry([seed], out);
      expect(result).toBe(out);
      const written = JSON.parse(readFileSync(out, "utf8")) as { entries: RegistryEntry[] };
      expect(written.entries).toHaveLength(1);
      expect(written.entries[0]?.verification.status).toBe("unverified");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("falls back to projectDataDir when no explicit path is given", async () => {
    const result = await runWriteRegistry([seed]);
    expect(result).toBe(join(workspace.dir, "customs_registry.json"));
    const written = JSON.parse(readFileSync(result, "utf8")) as { entries: RegistryEntry[] };
    expect(written.entries).toHaveLength(1);
  });

  it("resolves an explicit path inside the data directory", async () => {
    const out = join(workspace.dir, "customs_registry.json");
    await expect(runWriteRegistry([seed], out)).resolves.toBe(out);
    const written = JSON.parse(readFileSync(out, "utf8")) as { entries: unknown[] };
    expect(written.entries).toHaveLength(1);
  });

  it("writes to an explicit path and logs the result", async () => {
    const dir = mkdtempSync(join(tmpdir(), "write-registry-log-"));
    try {
      const out = join(dir, "registry.json");
      const lines: string[] = [];
      const result = await runWriteRegistry([seed], out, (line) => lines.push(line));
      expect(result).toBe(out);
      expect(existsSync(out)).toBe(true);
      expect(existsSync(out + ".tmp")).toBe(false);
      expect(lines).toEqual([`Wrote 1 registry entries at ${out}`]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("defaults to the workspace data directory and creates it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "write-registry-default-"));
    try {
      const out = join(dir, "data", "customs_registry.json");
      const result = await runWriteRegistry([seed], out);
      expect(result).toBe(out);
      expect(existsSync(out)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("replaces an existing file atomically", async () => {
    const dir = mkdtempSync(join(tmpdir(), "write-registry-replace-"));
    try {
      const out = join(dir, "registry.json");
      writeFileSync(out, "stale", "utf8");
      await runWriteRegistry([seed], out);
      const written = JSON.parse(readFileSync(out, "utf8")) as { entries: RegistryEntry[] };
      expect(written.entries).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes a schema version 1 envelope with a generatedAt timestamp", async () => {
    const dir = mkdtempSync(join(tmpdir(), "write-registry-schema-"));
    try {
      const out = join(dir, "registry.json");
      await runWriteRegistry([seed], out);
      const written = JSON.parse(readFileSync(out, "utf8")) as { schemaVersion: number; generatedAt: string };
      expect(written.schemaVersion).toBe(1);
      expect(typeof written.generatedAt).toBe("string");
      expect(() => new Date(written.generatedAt)).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
