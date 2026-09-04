import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CustomsRegistry, Seed } from "./types.js";

export const SEEDS_FILE_NAME = "seeds.json";
export const REGISTRY_FILE_NAME = "customs_registry.json";
export const WORKSPACE_ROOT_MARKER = "pnpm-workspace.yaml";

// Locate the workspace root by walking up from this file: robust to the
// script moving within the repo and independent of the launch directory.
// Pass explicit `[seedsPath] [registryPath]` arguments to bypass this.
function findWorkspaceRoot(startDir: string): string {
  let dir = resolve(startDir);
  while (true) {
    if (existsSync(join(dir, WORKSPACE_ROOT_MARKER))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`workspace root marker ${WORKSPACE_ROOT_MARKER} not found`);
    dir = parent;
  }
}

const defaultDataDir = join(findWorkspaceRoot(dirname(fileURLToPath(import.meta.url))), "data");
const [seedsPathArg, registryPathArg] = process.argv.slice(2);
const seedsPath = seedsPathArg ?? resolve(defaultDataDir, SEEDS_FILE_NAME);
const registryPath = registryPathArg ?? resolve(defaultDataDir, REGISTRY_FILE_NAME);

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
