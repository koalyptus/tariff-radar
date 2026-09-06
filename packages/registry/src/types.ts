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

export type VerificationStatus = "unverified" | "http_ok" | "http_failed" | "browser_ok" | "browser_failed";

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
  evidence: string[];
  error: string | null;
}

export interface RegistryEntry extends Seed {
  verification: RegistryVerification;
}

/** Versioned set of registry records written to `data/customs_registry.json`. */
export interface CustomsRegistry {
  schemaVersion: 1;
  generatedAt: string;
  entries: RegistryEntry[];
}
