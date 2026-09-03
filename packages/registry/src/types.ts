export interface Seed {
  isoCode: string
  countryName: string
  authority: string
  portalUrl: string
  sourceUrl: string
  sourceKind: "first_party_authority"
}

export interface RegistryEntry extends Seed {
  verification: {
    status: "unverified"
    checkedAt: null
    evidence: []
  }
}

export interface CustomsRegistry {
  schemaVersion: 1
  generatedAt: string
  entries: RegistryEntry[]
}
