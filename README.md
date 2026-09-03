# TariffRadar

TariffRadar is a challenge project exploring how [Solari](https://getsolari.com)
can help profile access to official customs and tariff portals.

The immediate goal is deliberately small: create a current, evidence-backed
`customs_registry.json` for a curated set of countries. The registry should tell
downstream automation where an official portal is, whether it was reachable, and
what access conditions were actually observed during the probe.

This is a prototype and challenge submission, not yet a production compliance
database or a claim to have mapped every country.

## Why This Use Case

Customs information is distributed across government portals, tariff search
tools, notices, and downloadable documents. These sources differ in language,
site technology, uptime, and access behavior. A single HTTP scraper strategy is
therefore unlikely to work consistently.

TariffRadar tests a more practical workflow:

```text
country seeds
    -> direct probe
    -> Solari browser probe when needed
    -> record observable evidence
    -> customs_registry.json
```

Solari is useful here because the probe can use a real cloud browser, optional
stealth, country-specific proxy egress, and persistent profiles when a target
requires browser execution. The project will only record protections such as
WAFs, CAPTCHA challenges, or geo restrictions when the probe has evidence for
them. They are not assumed from a country or domain name.

## Challenge Scope

The first demonstration targets eight representative portals rather than
pretending to solve all 195 countries at once. The selection is intended to
exercise different conditions: open sources, dynamic interfaces, non-English
content, regional organizations, intermittent availability, and protected or
geo-sensitive access.

The country list and URLs are hypotheses until verified. The generated registry,
probe logs, and source URLs are the authority for what the project can claim.

## Planned Registry

The first output is a local JSON asset, not a hosted API or SaaS product.
A registry entry should remain focused on facts that can be checked and replayed:

```json
{
  "isoCode": "MX",
  "countryName": "Mexico",
  "officialPortalUrl": "https://example.gov",
  "verification": {
    "status": "verified",
    "checkedAt": "2026-09-03T00:00:00.000Z",
    "httpStatus": 200,
    "latencyMs": 840,
    "evidence": ["loaded_document", "customs_keyword"]
  },
  "accessProfile": {
    "directRequest": "failed",
    "browserRequired": true,
    "proxyCountry": "MX",
    "stealthUsed": true,
    "captchaObserved": false
  },
  "source": {
    "kind": "official_registry",
    "url": "https://example.gov/source"
  }
}
```

Fields may change as the implementation develops. In particular, values such as
`captchaObserved` describe an observation from a run; they are not permanent
properties of an entire country or customs system.

## Planned Architecture

1. **Seeds:** Store a small ISO-country list with candidate first-party URLs and
  source attribution in [data/seeds.json](data/seeds.json).
2. **Direct probe:** Make a lightweight request and record status, redirects,
   timing, and response signals.
3. **Browser probe:** Escalate to Solari only when direct access is inconclusive
   or fails. Use standard Playwright-compatible page operations.
4. **Verification:** Check that the rendered page is relevant using observable
   content, links, document metadata, and any available tariff or HS-code UI.
5. **Registry output:** Write validated observations and timestamps to
   `customs_registry.json`, retaining enough evidence to explain each result.

Later work may add document downloads, OCR, translation, change detection, and
structured tariff extraction. Those are outside the first registry milestone.

## Solari Integration

The existing examples in this repository document the real TypeScript SDK usage:

```ts
import { Solari } from "@solarisdk/browser"

const solari = new Solari({ apiKey: process.env.SOLARI_API_KEY! })
const browser = await solari.launch({
  stealth: true,
  proxy: "mx",
})

try {
  const page = await browser.newPage()
  await page.goto("https://example.gov")
  console.log(await page.title())
} finally {
  await browser.close()
  await solari.close()
}
```

The final probe should measure what happened, rather than treating every
Solari option as necessary. Open portals should not incur proxy or browser cost
without a reason. CAPTCHA solving, proxy routing, and stealth should be enabled
only where the run and the target's terms permit it.

## Current Status

- Repository forked from the Solari Cookbook.
- TypeScript Solari browser examples available under `examples/`.
- First-party seed list for eight countries: available in
  [data/seeds.json](data/seeds.json).
- Registry package scaffold: available in `packages/registry`.
- Generated registry: not available yet; it will be created only after probe
  logic records observations from the seed URLs.

## Planned Quickstart

The seed-only scaffold is not yet a registry generator. It has no network or
Solari probing logic and must not be presented as verified data. The next step
is to implement the probe before generating the registry:

```bash
npm install
npm run typecheck
```

The eventual probe command will write `data/customs_registry.json` from direct
and Solari-backed observations. It will require a `SOLARI_API_KEY`; the current
seed-only scaffold does not contact Solari and does not generate a registry.

## Evidence and Limitations

- A successful page load does not prove that all tariff data is complete or
  legally current.
- A failed probe does not prove that a portal is permanently unavailable.
- Domain patterns alone do not establish official status.
- Registry timestamps, source attribution, response metadata, and probe logs are
  essential for reviewing each result.
- Any regulatory interpretation must be checked against the original authority
  and should not be treated as legal advice.

## Solari Examples

The original runnable examples remain available while TariffRadar is developed:

- [Browser quickstart](examples/browser-quickstart-ts)
- [Stealth and proxy](examples/browser-stealth-proxy-ts)
- [Persistent profiles](examples/browser-profiles-ts)

See [Solari documentation](https://docs.getsolari.com) for the current API.

MIT licensed.
