import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSeeds } from "@tariff-radar/registry";
import type { Seed } from "@tariff-radar/registry";

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

describe("loadSeeds", () => {
  it("loads seeds from a JSON file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "registry-test-"));
    try {
      const path = join(dir, "seeds.json");
      writeFileSync(path, JSON.stringify([seedUS, seedMX]));
      await expect(loadSeeds(path)).resolves.toEqual([seedUS, seedMX]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
