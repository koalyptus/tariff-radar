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
 * Seed plus placeholder verification. The seed-only generator stamps every
 * record `unverified`; only a completed workflow result may upgrade this.
 */
export interface RegistryEntry extends Seed {
  verification: {
    status: "unverified";
    checkedAt: null;
    evidence: [];
  };
}

/** Versioned set of registry records written to `data/customs_registry.json`. */
export interface CustomsRegistry {
  schemaVersion: 1;
  generatedAt: string;
  entries: RegistryEntry[];
}
