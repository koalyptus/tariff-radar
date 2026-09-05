import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { projectDataDir } from "@tariff-radar/shared";
import type { CustomsRegistry, Seed } from "./types.js";

/**
 * Seed-only registry scaffold. Copies seeds into a registry stamped
 * `unverified` throughout. This output is explicitly NOT probe data and
 * must never be presented as verified.
 */

const SEEDS_FILE_NAME = "seeds.json";
const REGISTRY_FILE_NAME = "customs_registry.json";

/**
 * Generate an unverified registry from a seeds file.
 * @param argv - Optional `[seedsPath] [registryPath]`; defaults to workspace `data/`.
 * @returns The number of registry entries written.
 */
export async function runGenerateRegistry(argv: string[]): Promise<number> {
  const [seedsPathArg, registryPathArg] = argv;
  const dataDir = projectDataDir(import.meta.url);
  const seedsPath = seedsPathArg ?? join(dataDir, SEEDS_FILE_NAME);
  const registryPath = registryPathArg ?? join(dataDir, REGISTRY_FILE_NAME);

  const seeds = JSON.parse(await readFile(seedsPath, "utf8")) as Seed[];
  const registry: CustomsRegistry = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    entries: seeds.map((seed) => ({
      ...seed,
      verification: {
        status: "unverified",
        checkedAt: null,
        evidence: [],
      },
    })),
  };

  await mkdir(dirname(registryPath), { recursive: true });
  await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  console.log(`Generated ${registry.entries.length} unverified registry entries at ${registryPath}`);
  return registry.entries.length;
}
