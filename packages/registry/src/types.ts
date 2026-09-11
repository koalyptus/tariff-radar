/**
 * Manually selected portal hypothesis. Input to the workflow, explicitly not
 * a verified fact: URLs may be outdated or not the best operational entry
 * point. `portalUrl` is the candidate tariff page under test; `sourceUrl` is
 * the first-party authority provenance behind the selection.
 */
export interface Seed {
  /** ISO country code. */
  isoCode: string;
  /** Display country name. */
  countryName: string;
  /** Owning authority name. */
  authority: string;
  /** Candidate customs/tariff page to probe. */
  portalUrl: string;
  /** Authority page corroborating the selection. */
  sourceUrl: string;
}

/**
 * Verification status for one registry record. Currently only produces
 * "unverified" — transport success (HTTP 200 or browser render) is captured
 * via method, error, and the per-method status fields, not via this field.
 * This field is reserved for future content-relevance checks before any
 * record can claim verification beyond reachable.
 */
export type VerificationStatus = "unverified";

export interface RegistryVerification {
  status: VerificationStatus;
  checkedAt: string;
  method: string;
  provider: string | null;
  directStatus: number | null;
  directLatencyMs: number;
  directAttempts: number;
  directError: string | null;
  browserStatus: number | null;
  browserFinalUrl: string | null;
  browserTitle: string | null;
  browserLatencyMs: number | null;
  /** Provider session id for console lookup, or null when unreported. */
  browserSessionId: string | null;
  /** Documents retrieved on this run; traceable via the artifact manifest. */
  artifactCount: number;
  evidence: string[];
  error: string | null;
}

export interface RegistryEntry extends Seed {
  verification: RegistryVerification;
}

/** Schema version stamped into every registry envelope; single source of truth. */
export const REGISTRY_SCHEMA_VERSION = 1 as const;

/** Versioned set of registry records written to `data/customs_registry.json`. */
export interface CustomsRegistry {
  schemaVersion: typeof REGISTRY_SCHEMA_VERSION;
  generatedAt: string;
  entries: RegistryEntry[];
}

/**
 * One stored document traced to its registry record. Lives in the artifact
 * manifest (`data/artifact_manifest.json`); the registry entry carries only
 * the count.
 */
export interface ArtifactManifestEntry {
  /** ISO code of the seed whose run retrieved the document. */
  isoCode: string;
  /** Original document URL the bytes were retrieved from. */
  sourceUrl: string;
  /** Manifest-relative path of the stored file (`artifacts/{ISO}/{sha256}.{ext}`). */
  path: string;
  /** Lowercase hex SHA-256 of the stored bytes. */
  sha256: string;
  /** Stored byte length. */
  bytes: number;
  /** Observed content type. */
  contentType: string;
  /** Whether a PDF carries an extractable text layer; null for non-PDFs. */
  textLayer: boolean | null;
  /** Retrieving provider name, or null for the direct path. */
  provider: string | null;
  /** ISO timestamp of the retrieval. */
  retrievedAt: string;
}

/** Schema version stamped into every artifact manifest envelope. */
export const ARTIFACT_MANIFEST_SCHEMA_VERSION = 1 as const;

/** Versioned set of stored documents written to `data/artifact_manifest.json`. */
export interface ArtifactManifest {
  schemaVersion: typeof ARTIFACT_MANIFEST_SCHEMA_VERSION;
  generatedAt: string;
  artifacts: ArtifactManifestEntry[];
}
