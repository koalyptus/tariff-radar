import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { projectRoot } from "@tariff-radar/shared";
import type { CustomsRegistry, Seed } from "./types.js";

/**
 * Seed-only registry scaffold. Copies `data/seeds.json` into
 * `data/customs_registry.json` stamped `unverified` throughout. This output
 * is explicitly NOT probe data and must never be presented as verified.
 */

const SEEDS_FILE_NAME = "seeds.json";
const REGISTRY_FILE_NAME = "customs_registry.json";

// Pass explicit `[seedsPath] [registryPath]` arguments to point the
// generator elsewhere; otherwise it resolves the workspace `data/`.
const [seedsPathArg, registryPathArg] = process.argv.slice(2);
const dataDir = join(projectRoot(import.meta.url), "data");
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
