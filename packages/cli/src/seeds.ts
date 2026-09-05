import { readFile } from "node:fs/promises";
import type { Seed } from "@tariff-radar/registry";

/**
 * Seed file loading. Single-seed selection lives in the workflow
 * (`findTarget`); this module only reads files.
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
