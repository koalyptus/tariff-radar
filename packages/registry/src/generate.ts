import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { projectDataDir } from "@tariff-radar/shared";
import type { RegistryEntry, CustomsRegistry } from "./types.js";

const REGISTRY_FILE_NAME = "customs_registry.json";
const ATOMIC_FILE_SUFFIX = ".tmp";

/**
 * Write registry output atomically from an array of registry entries.
 * The data is first written to a sibling temp file (finalPath + ".tmp"),
 * then renamed onto the destination. The rename is atomic on the same
 * filesystem, so a reader never observes a half-written file: either the
 * previous contents or the complete new contents are visible.
 * @param entries - Registry entries to write (produced by the mapper).
 * @param registryPath - Optional explicit path; defaults to workspace `data/customs_registry.json`.
 * @param log - Success line sink; writes to stdout in production.
 * @returns The path the registry was written to.
 * @throws If the temp file is written but the rename fails, the temp file
 *   is cleaned up before rethrowing so no stale ".tmp" artifact is left behind.
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
  try {
    await writeFile(tmpPath, JSON.stringify(registry, null, 2) + "\n", "utf8");
    await rename(tmpPath, finalPath);
  } catch (error) {
    /* Clean up the temp file if the write or rename failed mid-way so a
       stale ".tmp" never lingers on disk. */
    await rm(tmpPath, { force: true }).catch(() => undefined);
    throw error;
  }
  log?.(`Wrote ${registry.entries.length} registry entries at ${finalPath}`);
  return finalPath;
}
