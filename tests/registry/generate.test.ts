import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runWriteRegistry } from "../../packages/registry/src/generate.js";
import type { RegistryEntry } from "../../packages/registry/src/types.js";

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
    const out = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "customs_registry.json");
    let existed = false;
    let backup = "";
    try {
      try {
        backup = readFileSync(out, "utf8");
        existed = true;
      } catch {
        existed = false;
      }
      const result = await runWriteRegistry([seed]);
      expect(result).toBe(out);
      const written = JSON.parse(readFileSync(out, "utf8")) as { entries: RegistryEntry[] };
      expect(written.entries).toHaveLength(1);
    } finally {
      if (existed) {
        writeFileSync(out, backup);
      } else {
        rmSync(out, { force: true });
      }
    }
  });

  it("defaults to the workspace data directory when path is explicitly provided", async () => {
    const out = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "customs_registry.json");
    let existed = false;
    let backup = "";
    try {
      try {
        backup = readFileSync(out, "utf8");
        existed = true;
      } catch {
        existed = false;
      }
      await expect(runWriteRegistry([seed], out)).resolves.toBe(out);
      const written = JSON.parse(readFileSync(out, "utf8")) as { entries: unknown[] };
      expect(written.entries).toHaveLength(1);
    } finally {
      if (existed) {
        writeFileSync(out, backup);
      } else {
        rmSync(out, { force: true });
      }
    }
  });
});
