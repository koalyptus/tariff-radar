import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runWriteRegistry } from "@tariff-radar/registry";
import type { RegistryEntry } from "@tariff-radar/registry";

const seed = {
  isoCode: "US",
  countryName: "United States",
  authority: "USITC",
  portalUrl: "https://hts.usitc.gov/",
  sourceUrl: "https://www.usitc.gov/tariff_affairs",
};

function entry(): RegistryEntry {
  return {
    ...seed,
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
      evidence: ["direct_response"],
      error: null,
    },
  };
}

describe("runWriteRegistry", () => {
  it("writes to an explicit path and logs the result", async () => {
    const dir = mkdtempSync(join(tmpdir(), "write-registry-"));
    try {
      const out = join(dir, "registry.json");
      const lines: string[] = [];
      const result = await runWriteRegistry([entry()], out, (line) => lines.push(line));
      expect(result).toBe(out);
      expect(existsSync(out)).toBe(true);
      expect(existsSync(out + ".tmp")).toBe(false);
      const written = JSON.parse(readFileSync(out, "utf8")) as { entries: RegistryEntry[] };
      expect(written.entries).toHaveLength(1);
      expect(written.entries[0]?.verification.evidence).toEqual(["direct_response"]);
      expect(lines).toEqual([`Wrote 1 registry entries at ${out}`]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("defaults to the workspace data directory and creates it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "write-registry-default-"));
    try {
      const out = join(dir, "data", "customs_registry.json");
      const result = await runWriteRegistry([entry()], out);
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
      await runWriteRegistry([entry()], out);
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
      await runWriteRegistry([entry()], out);
      const written = JSON.parse(readFileSync(out, "utf8")) as { schemaVersion: number; generatedAt: string };
      expect(written.schemaVersion).toBe(1);
      expect(typeof written.generatedAt).toBe("string");
      expect(() => new Date(written.generatedAt)).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
