import { readFile } from "node:fs/promises";
import type { Seed } from "@tariff-radar/registry";

/**
 * Seed loading and selection. `loadSeeds` is the only impure function here;
 * `findSeed` is pure so ISO matching stays unit-testable without files.
 */

/**
 * Read and parse a seeds file.
 * @param seedsPath - Path to a JSON array of seeds.
 * @returns The parsed seeds in file order.
 */
export async function loadSeeds(seedsPath: string): Promise<Seed[]> {
  const raw = await readFile(seedsPath, "utf8");
  return JSON.parse(raw) as Seed[];
}

/**
 * Select one seed by ISO code (case-insensitive).
 * @param seeds - Candidate seeds in file order.
 * @param isoCode - ISO country code to match.
 * @returns The matching seed.
 * @throws When no seed carries the ISO code.
 */
export function findSeed(seeds: Seed[], isoCode: string): Seed {
  const upper = isoCode.toUpperCase();
  const seed = seeds.find((candidate) => candidate.isoCode.toUpperCase() === upper);
  if (!seed) {
    throw new Error(`Unknown ISO code "${isoCode}".`);
  }
  return seed;
}
