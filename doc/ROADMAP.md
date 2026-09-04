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
- `provider-solari`: Solari-specific browser implementation.
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
- [x] Keep Solari SDK imports inside `packages/provider-solari`.
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
- [ ] Inject the direct probe rather than importing the default implementation
      directly, if tests or alternate direct transports require it.
- [ ] Add retry and timeout policy at the workflow boundary.
- [ ] Add focused tests with fake direct and browser providers.
- [ ] Add content relevance checks for customs, tariff, or HS-code evidence.

**Done when:** A deterministic test suite proves the direct-first fallback
sequence and verifies cleanup on every path.

## Phase 8: Registry Output

- [ ] Define the final registry entry schema from observed workflow results.
- [ ] Preserve seed provenance in every successful registry record.
- [ ] Record verification status, timestamp, method, provider, and evidence.
- [ ] Represent failed and inconclusive runs without calling them verified.
- [ ] Write registry output atomically to `data/customs_registry.json`.
- [ ] Do not generate registry records from seeds alone.

**Done when:** The output contains only records supported by a completed
workflow result and can be reviewed without reading application logs.

## Phase 9: CLI and Single-Portal Demo

- [x] Add a TypeScript CLI for one seed by ISO code.
- [x] Add a CLI mode for all eight seeds.
- [x] Make the provider selection explicit.
- [x] Require `SOLARI_API_KEY` only when the Solari provider is selected.
- [ ] Print a concise result summary and output path.
- [x] Add a dry-run or direct-only mode that needs no Solari credentials.
- [x] Document the real commands in the README.

**Done when:** A contributor can run one direct-only example without secrets,
and one Solari-backed example with `SOLARI_API_KEY`.

Note: `pnpm probe` prints a concise per-seed summary to stdout but writes no
registry file yet, so the summary half of the checkbox is done and the output
path half (Phase 8) stays open.

## Phase 10: Verification Quality

- [ ] Verify that the final URL and page title are captured.
- [ ] Detect relevant tariff, customs, duty, or HS-code terminology.
- [ ] Detect relevant links and downloadable tariff documents.
- [ ] Separate authority verification from content relevance verification.
- [ ] Store evidence snippets or stable evidence identifiers.
- [ ] Avoid inferring CAPTCHA, WAF, geo-blocking, or stealth requirements
      without observations.

**Done when:** A successful network response alone cannot produce a verified
customs registry record.

## Phase 11: Document Ingestion

- [ ] Capture linked tariff documents and downloads.
- [ ] Store raw documents with source URL and retrieval timestamp.
- [ ] Detect text PDFs versus scanned documents.
- [ ] Add OCR only for documents that need it.
- [ ] Preserve the original artifact alongside extracted text.

**Done when:** A source document can be traced from registry record to its
original URL and stored raw artifact.

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
