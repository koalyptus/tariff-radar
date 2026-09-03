import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { CustomsRegistry, Seed } from "./types.js"

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const seedsPath = resolve(packageRoot, "data", "seeds.json")
const registryPath = resolve(packageRoot, "data", "customs_registry.json")

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
