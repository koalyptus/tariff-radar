import { createHash } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ArtifactRecord, WorkflowResult } from "@tariff-radar/probe-core";
import { ARTIFACT_MANIFEST_SCHEMA_VERSION } from "./types.js";
import type { ArtifactManifest, ArtifactManifestEntry } from "./types.js";

export const ARTIFACT_MANIFEST_FILE_NAME = "artifact_manifest.json";
export const ARTIFACTS_DIR_NAME = "artifacts";
const ATOMIC_FILE_SUFFIX = ".tmp";

/** Fallback extension when neither content type nor URL names one. */
const DEFAULT_ARTIFACT_EXTENSION = "bin";

/** File extension by observed content type (without parameters or case). */
const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/csv": "csv",
  "application/zip": "zip",
};

/**
 * Outcome of storing one run's artifacts: the manifest path and how many
 * files landed on disk.
 */
export interface StoredArtifacts {
  /** Absolute path of the written manifest. */
  manifestPath: string;
  /** Stored files (manifest excluded). */
  fileCount: number;
}

/**
 * Store every artifact carried by completed workflow results under
 * `data/artifacts/{ISO}/{sha256}.{ext}` and write the tracing manifest
 * beside the registry. Each file and the manifest itself are written
 * atomically (sibling temp file plus rename), so a reader never observes
 * a half-written file. Pure provenance: paths and hashes derive from the
 * observed records only.
 * @param results - Completed workflow results in run order.
 * @param dataDir - Data directory holding the artifacts tree and manifest.
 * @returns The manifest path and stored file count.
 */
export async function runStoreArtifacts(results: readonly WorkflowResult[], dataDir: string): Promise<StoredArtifacts> {
  const resolvedDir = dataDir;
  const entries: ArtifactManifestEntry[] = [];
  for (const result of results) {
    for (const artifact of result.artifacts) {
      entries.push(await storeArtifact(artifact, result.seed.isoCode, resolvedDir));
    }
  }
  const manifest: ArtifactManifest = {
    schemaVersion: ARTIFACT_MANIFEST_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    artifacts: entries,
  };
  const manifestPath = join(resolvedDir, ARTIFACT_MANIFEST_FILE_NAME);
  await writeAtomic(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  return { manifestPath, fileCount: entries.length };
}

/**
 * Store one artifact's bytes and describe it for the manifest.
 * @param artifact - Retrieved document with provenance.
 * @param isoCode - Seed ISO code owning the run.
 * @param dataDir - Data directory holding the artifacts tree.
 * @returns The manifest entry for the stored file.
 */
async function storeArtifact(
  artifact: ArtifactRecord,
  isoCode: string,
  dataDir: string,
): Promise<ArtifactManifestEntry> {
  const sha256 = createHash("sha256").update(artifact.buffer).digest("hex");
  const extension = artifactExtension(artifact);
  const relativePath = join(ARTIFACTS_DIR_NAME, isoCode, `${sha256}.${extension}`);
  await writeAtomic(join(dataDir, relativePath), artifact.buffer);
  return {
    isoCode,
    sourceUrl: artifact.sourceUrl,
    path: relativePath,
    sha256,
    bytes: artifact.contentLength,
    contentType: artifact.contentType,
    textLayer: artifact.textLayer,
    provider: artifact.provider,
    retrievedAt: artifact.retrievedAt,
  };
}

/**
 * Pick a file extension from the observed content type, falling back to
 * the source URL path and finally to a bare binary extension.
 * @param artifact - Retrieved document with content type and source URL.
 * @returns The lowercase extension without a leading dot.
 */
function artifactExtension(artifact: ArtifactRecord): string {
  const fromContentType = extensionForContentType(artifact.contentType);
  if (fromContentType !== null) {
    return fromContentType;
  }
  const path = artifact.sourceUrl.split(/[?#]/, 1)[0];
  const parts = path.split(".");
  const fromUrl = parts[parts.length - 1].toLowerCase();
  if (/^[a-z0-9]{1,8}$/.test(fromUrl)) {
    return fromUrl;
  }
  return DEFAULT_ARTIFACT_EXTENSION;
}

/**
 * Map an observed content type to a file extension.
 * @param contentType - Raw `content-type` header value, possibly empty.
 * @returns The extension, or null when the type is unknown.
 */
function extensionForContentType(contentType: string): string | null {
  const normalized = contentType.split(";", 1)[0].trim().toLowerCase();
  return EXTENSION_BY_CONTENT_TYPE[normalized] ?? null;
}

/**
 * Write a file atomically: bytes land in a sibling temp file first, then
 * rename onto the destination. On failure the temp file is cleaned up.
 * @param finalPath - Destination path.
 * @param data - Bytes or text to write.
 */
async function writeAtomic(finalPath: string, data: Buffer | string): Promise<void> {
  const tmpPath = finalPath + ATOMIC_FILE_SUFFIX;
  await mkdir(dirname(finalPath), { recursive: true });
  try {
    await writeFile(tmpPath, data);
    await rename(tmpPath, finalPath);
  } catch (error) {
    await rm(tmpPath, { force: true }).catch(() => undefined);
    throw error;
  }
}
