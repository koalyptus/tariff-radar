import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { projectDataDir } from "@tariff-radar/shared";
import type { RegistryEntry, CustomsRegistry } from "./types.js";

const REGISTRY_FILE_NAME = "customs_registry.json";
const ATOMIC_FILE_SUFFIX = ".tmp";

/**
 * Write registry output atomically from an array of registry entries.
 * Writes to a temp file first, then renames — so the destination is never
 * in a partially-written state.
 * @param entries - Registry entries to write (produced by the mapper).
 * @param registryPath - Optional explicit path; defaults to workspace `data/customs_registry.json`.
 * @param log - Success line sink; writes to stdout in production.
 * @returns The path the registry was written to.
 */
export async function runWriteRegistry(
  entries: RegistryEntry[],
  registryPath?: string,
  log?: (line: string) => void,
): Promise<string> {
  const dataDir = registryPath ? dirname(registryPath) : projectDataDir(import.meta.url);
  const finalPath = registryPath ?? join(dataDir, REGISTRY_FILE_NAME);
  const tmpPath = finalPath + ATOMIC_FILE_SUFFIX;

  const registry: CustomsRegistry = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    entries,
  };

  await mkdir(dataDir, { recursive: true });
  await writeFile(tmpPath, JSON.stringify(registry, null, 2) + "\n", "utf8");
  await rename(tmpPath, finalPath);
  log?.(`Wrote ${registry.entries.length} registry entries at ${finalPath}`);
  return finalPath;
}
