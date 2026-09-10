# TariffRadar Roadmap

This roadmap scopes TariffRadar into small phases that can be completed and
checked independently. A checked phase means its acceptance criteria are met,
not merely that the files exist.

## Project Goal

Build a small, evidence-backed workflow that starts from manually selected
customs and tariff portal candidates, attempts direct access, uses a configured
browser provider when necessary, verifies useful tariff content, and produces a
reviewable registry record.

The initial challenge demonstration uses eight countries. The seed list is an
arbitrary starting hypothesis. It is not an authoritative list of all customs
portals and it does not contain verified access claims.

## Architecture

```text
data/seeds.json
        |
        v
workflow orchestrator
   |              |
   v              v
probe-core     browser provider
   |              |
   v              v
 direct HTTP   Solari adapter
        |
        v
 evidence-backed registry output
```

Responsibilities:

- `probe-core`: reusable probe capabilities, contracts, and result types.
- `workflow`: sequencing, fallback, timeouts, retries, evidence assembly, and
  workflow logging.
- `providers/solari`: Solari-specific browser implementation.
- `registry`: seed and registry models plus eventual output handling.
- `data`: manually curated inputs and generated artifacts.

## Configuration and Secrets

Keep configuration close to the boundary where it is used:

- `data/seeds.json` contains non-secret candidate inputs.
- Environment variables contain provider credentials such as
  `SOLARI_API_KEY`.
- A CLI or composition root selects the provider and constructs it with the
  required credentials.
- `probe-core`, workflow code, and registry models do not read environment
  variables or know provider-specific key names.
- `.env` files remain local and ignored; commit `.env.example` files only when
  a runnable command needs documented variable names.
- Unit tests use fake providers and do not require credentials.

The intended dependency direction is:

```text
environment -> CLI/composition root -> provider adapter -> workflow
```

## Phase 0: Scope and Evidence Rules

- [x] Define the initial use case: customs and tariff portal ingestion.
- [x] Limit the challenge demonstration to eight candidate countries.
- [x] Define seeds as manually selected hypotheses, not verified facts.
- [x] Require evidence before claiming a portal is official, reachable, or
      protected.
- [x] Keep regulatory interpretation and legal advice outside the project
      claims.

**Done when:** The README and roadmap distinguish candidate inputs from
observed registry output.

## Phase 1: Monorepo Foundation

- [x] Add a pnpm workspace configuration.
- [x] Add shared TypeScript compiler settings.
- [x] Add root `build` and `typecheck` scripts.
- [x] Add the `packages/registry` package scaffold.
- [x] Keep generated build output and dependencies out of Git.
- [x] Add root `test` and `test:watch` scripts using Vitest.

**Done when:** `pnpm install`, `pnpm typecheck`, `pnpm build`, and
`pnpm test` work in a normal pnpm environment.

## Phase 2: Seed Inputs

- [x] Add eight manually selected country records in `data/seeds.json`.
- [x] Use first-party authority URLs as provenance sources.
- [x] Use customs or tariff-oriented pages as operational portal candidates
      where corroborated.
- [x] Keep `portalUrl` and `sourceUrl` semantically distinct.
- [x] Remove redundant `sourceKind` metadata.
- [x] Validate JSON syntax and unique ISO codes.

**Done when:** Every seed has an ISO code, country, authority, candidate portal
URL, and source URL, while remaining explicitly unverified.

## Phase 3: Provider-Neutral Probe Boundary

- [x] Define browser session, page, response, and option contracts.
- [x] Define the `BrowserProbeProvider` interface.
- [x] Define shared direct-probe and workflow result types.
- [x] Implement the Solari browser adapter behind the provider contract.
- [x] Keep Solari SDK imports inside `packages/providers/solari`.
- [x] Replace probe magic values with named constants.

**Done when:** The core and workflow layers compile without importing the
Solari SDK directly.

## Phase 4: Logging and Observability

- [x] Define a provider-neutral `ProbeLogger` interface.
- [x] Accept an injected logger in the workflow.
- [x] Log probe start, direct completion, browser fallback, browser completion,
      and failure events.
- [x] Include safe structured context such as ISO code, URL, method, status,
      provider, and latency.
- [x] Never log API keys, cookies, credentials, tokens, or page contents by
      default.
- [x] Provide a simple console logger for the CLI.
- [x] Use a no-op or recording logger in tests.

**Done when:** A run explains its decisions and outcomes through structured
logs without exposing secrets or requiring a logging framework.

## Phase 5: Unit Test Foundation

- [x] Adopt Vitest as the workspace test runner.
- [x] Add Vitest as a root development dependency.
- [x] Add tests for direct probe success, HTTP failure, timeout, and network
      error.
- [x] Add fake browser provider and fake session/page implementations.
- [x] Test direct-first workflow behavior.
- [x] Test browser fallback after direct failure.
- [x] Test behavior when no browser provider is configured.
- [x] Test page and session cleanup on success and failure.
- [x] Test logger calls using a recording logger without network access.
- [x] Keep unit tests deterministic and independent of `SOLARI_API_KEY`.
- [x] Keep live portal and Solari checks separate from unit tests.

**Done when:** The core workflow behavior is covered by fast local tests that
do not contact government portals or external provider services, and `pnpm test`
passes locally.

## Phase 6: Direct Probe Capability

- [x] Move native `fetch` probing into `packages/probe-core`.
- [x] Record HTTP status, final URL, latency, and errors.
- [x] Apply a bounded request timeout.
- [x] Add focused tests for success, HTTP failure, timeout, and network error.
- [x] Decide whether an HTTP 200 response is sufficient or requires content
      checks before workflow success.

**Done when:** Direct probing is independently testable and returns stable,
provider-neutral results for all expected failure modes.

Decision: HTTP 200 means transport reachable only (`direct.ok`), never
verified tariff content. Content relevance checks belong to Phase 10; the
registry stays `unverified` until then.

## Phase 7: Workflow Orchestration

- [x] Create the `packages/workflow` package.
- [x] Run the direct probe first.
- [x] Use a browser provider only after direct access fails.
- [x] Return a failed result when no browser provider is configured.
- [x] Close browser pages and sessions on success and failure.
- [x] Direct-transport seam settled: global `fetch` stubbing keeps tests
      hermetic, so no direct-probe injection is needed.
- [x] Add retry and timeout policy at the workflow boundary.
- [x] Add focused tests with fake direct and browser providers.
- [x] Retry lives in the direct transport: up to `DEFAULT_DIRECT_PROBE_ATTEMPTS`
      attempts with a quiet wait between them, attempt count and total latency
      in the result. Content relevance checks live in Phase 10, not here.

**Done when:** A deterministic test suite proves the direct-first fallback
sequence and verifies cleanup on every path.

## Phase 8: Registry Output

- [x] Define the final registry entry schema from observed workflow results.
- [x] Preserve seed provenance in every successful registry record.
- [x] Record verification status, timestamp, method, provider, and evidence.
- [x] Represent failed and inconclusive runs without calling them verified.
- [x] Write registry output atomically to `data/customs_registry.json`.
- [x] Do not generate registry records from seeds alone.

**Done when:** The output contains only records supported by a completed
workflow result and can be reviewed without reading application logs.

## Phase 9: CLI and Single-Portal Demo

- [x] Add a TypeScript CLI for one seed by ISO code.
- [x] Add a CLI mode for all eight seeds.
- [x] Make the provider selection explicit.
- [x] Require `SOLARI_API_KEY` only when the Solari provider is selected.
- [x] Print a concise result summary and output path.
- [x] Add a dry-run or direct-only mode that needs no Solari credentials.
- [x] Document the real commands in the README.

**Done when:** A contributor can run one direct-only example without secrets,
and one Solari-backed example with `SOLARI_API_KEY`.

## Phase 10: Verification Quality

- [x] Verify that the final URL and page title are captured.
- [x] Detect relevant tariff, customs, duty, or HS-code terminology.
- [ ] Detect relevant links and downloadable tariff documents.
- [x] Separate authority verification from content relevance verification.
- [x] Store evidence snippets or stable evidence identifiers.
      |- [x] Write inconclusive or content-relevance-failing seeds to
      | `needs_review.json` for human triage, preserving the full evidence trail.
- [x] Avoid inferring CAPTCHA, WAF, geo-blocking, or stealth requirements
      | without observations.

**Done when:** A successful network response alone cannot produce a verified
customs registry record.

Notes (Phase 10, as shipped):

- Final URL is captured on both paths; page title is captured on the browser
  path only. Direct probes stay `fetch`-only by design, so direct titles
  remain null.
- Terminology detection is English landing-page keywords
  (`assessContentRelevance` in `probe-core`); any one of the four keyword
  families keeps an entry out of triage. No match proves nothing.
- Direct probes capture capped textual bodies (binary skipped, failures yield
  null text), so `direct`-ok entries carry keyword evidence as well. The
  browser path exists for reach — portals unreachable or unrenderable over
  direct fetch — not for keywords: keyword-less direct runs sit in triage
  without automatic browser escalation.
- Authority vs content stays separated by construction: authority lives in
  seed provenance (`portalUrl` vs `sourceUrl`), content lives in evidence
  keys, and `status` stays `unverified` — no score, no threshold.
- Evidence uses stable identifiers, never raw page snippets.
- Link/document href extraction needs a `BrowserProbePage` contract
  extension (links provider) and belongs with Phase 11 document ingestion;
  picked up there, not silently dropped.

## Phase 11: Document Ingestion (Solari as Primary Execution Engine)

Direct `fetch` handles open static links. Guarded and dynamic document
artifacts — the normal case on real customs portals — need the Solari
browser provider, which is the primary execution engine for this phase:

- **JS-rendered download triggers.** Portals often expose no static
  `<a href="schedule.pdf">` in raw HTML; downloads are driven by
  client-side execution (`javascript:void(0)`, `onclick` export
  builders). Only a rendered DOM sees the generated blob/CDN URLs.
- **WAF / challenge guards on document endpoints.** Download routes
  (`/api/v1/tariffs/download/pdf`) frequently sit behind Cloudflare
  Turnstile, Akamai Bot Manager, or JS rate-limit challenges that answer
  direct `fetch` with 401/403 or an HTML challenge page instead of the
  binary. Solari passes the guard with its stealth context and automated
  challenge handling, then streams the raw bytes.
- **Session-bound and geo-fenced streaming.** Document CDNs often require
  cookies established during navigation or egress from the portal's
  region. Solari inherits the verified navigation session and routes
  through the requested residential proxy region.

Same rules as the portal probe: direct-first, browser only on observed
need, always close pages/sessions, never infer guards without an
observation. A stored artifact records which provider retrieved it, so a
reviewer can see exactly where direct HTTP fell short and browser
automation was required.

- [x] Add a binary-safe direct artifact fetch in `probe-core` (byte
      download with size caps and content-type observation; never decode
      binary bodies as text).
- [x] Extend the `BrowserProbePage` contract with optional document
      capability: `extractDocumentLinks()` (rendered-DOM link harvest)
      and `downloadArtifact(url)` (session-bound binary streaming).
      Optional so fakes and future providers stay valid; the workflow
      checks presence before calling.
- [x] Implement both methods in `packages/providers/solari` via the
      Playwright page (rendered-DOM evaluation, cookie-inheriting
      request context, stealth/proxy options carried over).
- [x] Orchestrate in the workflow: discover candidate links (direct HTML
      scan plus browser DOM), download direct-first, fall back to the
      browser provider on 401/403, HTML-instead-of-binary, or JS-driven
      links. Bound per-seed artifact count and bytes with named
      constants.
- [x] Store raw artifacts at `data/artifacts/{ISO}/{sha256}.{ext}` with a
      manifest tracing each registry record to its original URL and
      stored file (source URL, retrieval timestamp, provider,
      content-type, bytes, sha256). Atomic writes, like the registry.
- [x] Detect text PDFs versus scanned documents via the text layer only.
      No OCR and no image processing in this phase.
- [x] Preserve the original artifact; text extraction itself is future
      work, so there is nothing to sit alongside yet.
- [x] Extend fakes and keep the suite hermetic (no live portals, no
      `SOLARI_API_KEY`); coverage thresholds stay 100%.
- [x] Surface artifact counts/paths in the CLI summary and document the
      new outputs in the README.

Provisional decisions (refine during implementation):

- Contract shapes, per the earlier discussion:
  `extractDocumentLinks(): Promise<Array<{ url: string; label: string }>>`
  and
  `downloadArtifact(targetUrl: string): Promise<{ buffer: Buffer; contentType: string; contentLength: number }>`.
- Caps start at `MAX_ARTIFACTS_PER_SEED = 5` documents and
  `MAX_ARTIFACT_BYTES = 25_000_000` bytes per artifact.
- Manifest at `data/artifact_manifest.json`: `{ schemaVersion,
generatedAt, artifacts: Array<{ isoCode, sourceUrl, path, sha256,
bytes, contentType, provider, retrievedAt }> }`, written atomically.
- The manifest stands alone; `RegistryVerification` gains only
  `artifactCount: number`, traced via ISO code.
- Ingestion runs automatically on every probe, governed by the existing
  browser flags: `--browser=direct` still harvests open static links but
  never launches a browser for documents.
- New evidence keys: `document_link` (candidate link observed),
  `artifact_stored` (raw artifact written), `artifact_browser` (browser
  retrieval was required; provider attribution rides on `provider`).

**Done when:** A source document can be traced from registry record to
its original URL and stored raw artifact, with provider attribution
showing whether direct HTTP or Solari retrieval produced it — and
open static portals still cost no browser.

Notes (Phase 11, as shipped):

- Manifest entries also carry the PDF `textLayer` flag alongside the
  provisional fields; the registry entry carries only the count.
- Runs with observed-but-unretrieved document links (`document_link`
  evidence, `artifactCount` zero) join `needs_review.json` for human
  triage — guarded endpoints worth a manual look.
- No text is extracted from stored documents in this phase; the raw
  bytes plus the text-layer flag are the whole record.

Non-goals (stay in Phase 12+): OCR, image support, translation,
normalized tariff representation, change detection.

## Phase 12: Normalization and Change Detection

- [ ] Define a normalized representation for tariff and customs observations.
- [ ] Keep original language and translated text distinguishable.
- [ ] Extract HS codes, rates, restrictions, effective dates, and citations only
      where supported by source evidence.
- [ ] Compare new observations with prior runs.
- [ ] Report additions, removals, and changed values with source references.

**Done when:** A repeated run can explain what changed and link each change to
source evidence.

## Phase 13: Challenge Demo Hardening

- [ ] Run the workflow against a small, known subset of seeds.
- [ ] Capture reproducible logs without secrets.
- [ ] Measure direct versus browser fallback usage.
- [ ] Report observed latency and failures without turning them into permanent
      country claims.
- [ ] Confirm all URLs and claims in the demo are current.
- [ ] Update README status to match the working implementation.

**Done when:** The demo shows why browser automation is useful while remaining
honest about what was and was not verified.

## Out of Scope Until Needed

- Hosted APIs, payments, and data subscriptions.
- A database or vector store.
- Full coverage of every country.
- Automatic legal interpretation.
- Unsupported claims about anti-bot systems.
- A second provider implementation before the provider contract is exercised.
