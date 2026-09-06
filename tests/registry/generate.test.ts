import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runGenerateRegistry } from "../../packages/registry/src/index.js";

const seed = {
  isoCode: "US",
  countryName: "United States",
  authority: "USITC",
  portalUrl: "https://hts.usitc.gov/",
  sourceUrl: "https://www.usitc.gov/tariff_affairs",
};

function writeSeeds(dir: string): string {
  const seedsFile = join(dir, "seeds.json");
  writeFileSync(seedsFile, JSON.stringify([seed]));
  return seedsFile;
}

describe("runGenerateRegistry", () => {
  it("writes unverified entries to an explicit path", async () => {
    const dir = mkdtempSync(join(tmpdir(), "generate-test-"));
    try {
      const out = join(dir, "registry.json");
      const lines: string[] = [];
      await expect(runGenerateRegistry([writeSeeds(dir), out], (line) => lines.push(line))).resolves.toBe(1);
      const written = JSON.parse(readFileSync(out, "utf8")) as {
        entries: Array<{ verification: { status: string } }>;
      };
      expect(written.entries).toHaveLength(1);
      expect(written.entries[0]?.verification.status).toBe("unverified");
      expect(lines).toEqual([`Generated 1 unverified registry entries at ${out}`]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("defaults to the workspace data directory", async () => {
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
      await expect(runGenerateRegistry([])).resolves.toBe(8);
      const written = JSON.parse(readFileSync(out, "utf8")) as { entries: unknown[] };
      expect(written.entries).toHaveLength(8);
    } finally {
      if (existed) {
        writeFileSync(out, backup);
      } else {
        rmSync(out, { force: true });
      }
    }
  });
});
