import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { projectDataDir } from "@tariff-radar/shared";
import { REGISTRY_SCHEMA_VERSION } from "./types.js";
import type { RegistryEntry, CustomsRegistry } from "./types.js";

export const REGISTRY_FILE_NAME = "customs_registry.json";
export const NEEDS_REVIEW_FILE_NAME = "needs_review.json";
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
  return writeRegistryFile(entries, finalPath, "registry entries", log);
}

/**
 * Write human-triage output atomically from a subset of registry entries.
 * Same atomic `.tmp` + rename discipline as {@link runWriteRegistry}, same
 * envelope shape, so reviewers see the full evidence trail per entry.
 * @param entries - Registry entries needing review (see `selectNeedsReviewEntries`).
 * @param reviewPath - Optional explicit path; defaults to workspace `data/needs_review.json`.
 * @param log - Success line sink; writes to stdout in production.
 * @returns The path the review file was written to.
 */
export async function runWriteNeedsReview(
  entries: RegistryEntry[],
  reviewPath?: string,
  log?: (line: string) => void,
): Promise<string> {
  const dataDir = reviewPath ? dirname(reviewPath) : projectDataDir(import.meta.url);
  const finalPath = reviewPath ?? join(dataDir, NEEDS_REVIEW_FILE_NAME);
  return writeRegistryFile(entries, finalPath, "needs-review entries", log);
}

async function writeRegistryFile(
  entries: RegistryEntry[],
  finalPath: string,
  label: string,
  log?: (line: string) => void,
): Promise<string> {
  const tmpPath = finalPath + ATOMIC_FILE_SUFFIX;

  const registry: CustomsRegistry = {
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    entries,
  };

  await mkdir(dirname(finalPath), { recursive: true });
  try {
    await writeFile(tmpPath, JSON.stringify(registry, null, 2) + "\n", "utf8");
    await rename(tmpPath, finalPath);
  } catch (error) {
    /* Clean up the temp file if the write or rename failed mid-way so a
       stale ".tmp" never lingers on disk. */
    await rm(tmpPath, { force: true }).catch(() => undefined);
    throw error;
  }
  log?.(`Wrote ${registry.entries.length} ${label} at ${finalPath}`);
  return finalPath;
}
