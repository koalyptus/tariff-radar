import { realpathSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CustomsRegistry, Seed } from "./types.js";

/**
 * Seed-only registry scaffold. Copies `data/seeds.json` into
 * `data/customs_registry.json` stamped `unverified` throughout. This output
 * is explicitly NOT probe data and must never be presented as verified.
 */

const SEEDS_FILE_NAME = "seeds.json";
const REGISTRY_FILE_NAME = "customs_registry.json";

// TODO: move into a shared package when a second consumer needs it.
/**
 * Walk up from a module URL to the workspace root (the parent of `packages/`).
 * @param metaUrl - `import.meta.url` of the calling module.
 * @returns The workspace root directory.
 * @throws When no `packages/` ancestor exists.
 */
function projectRoot(metaUrl: string): string {
  let dir = dirname(realpathSync(fileURLToPath(metaUrl)));
  while (true) {
    if (basename(dir) === "packages") {
      return dirname(dir);
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error("Could not determine project root");
    }
    dir = parent;
  }
}

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
