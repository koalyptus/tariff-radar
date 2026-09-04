import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { CustomsRegistry, Seed } from "./types.js"

export const SEEDS_FILE_NAME = "seeds.json"
export const REGISTRY_FILE_NAME = "customs_registry.json"

// Default data directory, anchored at this file so the script works no
// matter which directory it is launched from. Pass explicit
// `[seedsPath] [registryPath]` arguments to point it elsewhere.
const defaultDataDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "data")
const [seedsPathArg, registryPathArg] = process.argv.slice(2)
const seedsPath = seedsPathArg ?? resolve(defaultDataDir, SEEDS_FILE_NAME)
const registryPath = registryPathArg ?? resolve(defaultDataDir, REGISTRY_FILE_NAME)

const seeds = JSON.parse(await readFile(seedsPath, "utf8")) as Seed[]
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
}

await mkdir(dirname(registryPath), { recursive: true })
await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8")
console.log(`Generated ${registry.entries.length} unverified registry entries at ${registryPath}`)
