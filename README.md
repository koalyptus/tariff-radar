# TariffRadar

TariffRadar is a project exploring how [Solari](https://getsolari.com)
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
    -> workflow orchestrator
      -> direct probe
      -> browser provider probe when needed
    -> record observable evidence
    -> customs_registry.json
```

The workflow orchestrator owns sequencing and decisions: when to try direct
access, when to escalate to a browser, how to apply timeouts and retries, and
how to assemble evidence. The browser step is provider-neutral. Solari is the
first adapter, but the core probe should not depend on a particular vendor or
assume that every provider supports stealth, proxy egress, CAPTCHA handling, or
persistent profiles.

## Challenge Scope

The first demonstration starts with eight manually selected portal candidates
rather than pretending to solve all 195 countries at once. This list is an
arbitrary starting hypothesis intended to exercise different conditions: open
sources, dynamic interfaces, non-English content, regional organizations,
intermittent availability, and protected or geo-sensitive access.

The entries in [data/seeds.json](data/seeds.json) are assumed inputs, not verified
facts. In particular, the URLs may be outdated, inaccessible, or not the best
operational tariff entrypoint. The workflow must verify both the authority and
the usefulness of each URL before including it in a generated registry.

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

1. **Seeds:** Store a manually curated ISO-country list with candidate URLs and
   source attribution in [data/seeds.json](data/seeds.json). Seeds are inputs to
   the workflow, not verified registry records.
2. **Direct probe:** Make a lightweight request and record status, redirects,
   timing, and response signals.
3. **Workflow:** Orchestrate the direct and browser probes, including fallback,
   timeout, retry, and failure decisions.
4. **Browser probe:** Escalate to a configured browser provider only when direct
   access is inconclusive or fails. Use the provider-neutral contract in
   `packages/probe-core`.
5. **Verification:** Check that the rendered page is relevant using observable
   content, links, document metadata, and any available tariff or HS-code UI.
6. **Registry output:** Write validated observations and timestamps to
   `customs_registry.json`, retaining enough evidence to explain each result.

Later work may add document downloads, OCR, translation, change detection, and
structured tariff extraction. Those are outside the first registry milestone.

## Provider Architecture

The registry and workflow layers depend on capabilities, not on Solari's SDK.
The browser boundary is defined in `packages/probe-core`:

```text
registry
  |
  v
workflow orchestrator
  |
  v
BrowserProbeProvider
  /             \
  v               v
providers/solari   another provider
```

`packages/providers/solari` adapts Solari's browser client to that contract. This
keeps the registry model and verification logic independent from provider-
specific APIs and capabilities. The same principle should be applied later to
document extraction and LLM-backed normalization: those should be injected
services rather than hard-coded vendors.

## Solari Adapter

The current adapter uses the actual TypeScript SDK:

```ts
import { Solari } from "@solarisdk/browser";

const solari = new Solari({ apiKey: process.env.SOLARI_API_KEY! });
const browser = await solari.launch({ stealth: true, proxy: "mx" });

try {
  const page = await browser.newPage();
  await page.goto("https://example.gov");
  console.log(await page.title());
} finally {
  await browser.close();
  await solari.close();
}
```

The adapter translates provider-neutral probe options into Solari options. The
final probe should measure what happened, rather than treating every Solari
option as necessary. Open portals should not incur proxy or browser cost
without a reason. CAPTCHA solving, proxy routing, and stealth should be enabled
only where the run and the target's terms permit it.

## Quickstart

```bash
pnpm install
pnpm build
pnpm probe
```

`pnpm probe` checks all eight portal candidates: direct first, Solari
browser fallback where direct fails. `SOLARI_API_KEY` can be exported or live
in a local `.env` (see `.env.example`); without a key the run warns once and
continues direct-only. Exit code is `1` when any seed ends `failed`, `2` on
usage errors. Per-seed progress prints on stderr, the result table on stdout.

### probe

| Flag                       | Default   | Description                                                          |
| -------------------------- | --------- | -------------------------------------------------------------------- |
| `[ISO]`                    | all seeds | Probe one portal candidate by ISO code.                              |
| `--browser=direct\|solari` | `solari`  | Browser fallback after direct failure; `direct` disables it.         |
| `--timeout-ms=N`           | `10000`   | Direct-probe timeout in milliseconds.                                |
| `--stealth`                | off       | Opt-in provider stealth/anti-detection measures.                     |
| `--proxy-country=XX`       | off       | Opt-in two-letter proxy egress country code.                         |
| `--captcha`                | off       | Opt-in provider CAPTCHA handling where the target's terms permit it. |
| `--log=pretty\|json`       | `pretty`  | Progress rendering: stage lines on stderr, or JSON lines.            |
| `--concurrency=N`          | `6`       | Max parallel seed probes (1–8).                                      |

Pass `--log=json` for the original machine-readable JSON lines.

The CLI prints a per-seed summary to stdout and writes no registry file yet:
the seed-only scaffold in `packages/registry` still emits `unverified`
placeholders. In the results above, `HTTP 200` means the portal answered
HTTP, not that tariff content was verified (see _Evidence and Limitations_).

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
