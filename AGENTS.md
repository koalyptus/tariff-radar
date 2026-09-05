# AGENTS.md — tariff-radar

pnpm monorepo (`packages/*`). ESM (`"type": "module"`), strict TS on `NodeNext`
module + resolution, shared base in `tsconfig.base.json`.

## Commands (pnpm only)

- `pnpm install`
- `pnpm typecheck` (`pnpm -r typecheck`) and `pnpm build` (`pnpm -r build`)
- `pnpm test` (`vitest run --coverage`) and `pnpm test:watch` (`vitest`).
  Tests live in root `tests/`, alias workspace sources (no prior build needed).
  Coverage thresholds are 100% lines/functions/branches/statements over
  `packages/*/src/**` (only the `generate-registry` and `cli/probe` entry
  scripts are excluded — they have top-level side effects: argv, fs, network,
  exit codes). Keep the suite hermetic: stub `fetch`, fake
  providers, never touch portals or the Solari API (`@solarisdk/browser` is
  aliased to `tests/fakes/`).
- `pnpm format` (write) and `pnpm format:check` (CI gate). Prettier defaults
  plus width 120 (LF comes from `.editorconfig`). Run `format` before committing.
- `pnpm lint` and `pnpm lint:fix`. Minimal ESLint (parser only, no preset):
  `curly` all — braces always required. Gate new rules by explicit decision.
- `pnpm verify` runs every gate in order: format:check, lint, typecheck, test.
- CI (`.github/workflows/ci.yaml`, push + PR, ubuntu/node 22) runs
  install, format:check, lint, typecheck, test, build as separate steps
  (same scripts `pnpm verify` chains locally). Hermetic — no secrets needed.
- `pnpm generate-registry` → builds registry deps, runs
  `node packages/registry/dist/generate-registry.js`, writes
  `data/customs_registry.json`
- `pnpm probe <ISO | --all> [--browser=solari] [--timeout-ms=N] [--stealth]
[--proxy-country=XX] [--captcha]` → builds cli deps, runs
  `node --env-file-if-exists=.env packages/cli/dist/probe.js`. Direct-only by
  default (no credentials); `--browser=solari` requires `SOLARI_API_KEY`.

## Package boundaries

- `packages/probe-core`: provider-neutral contracts (`BrowserProbeProvider`,
  page/session) + `runDirectProbe` (native `fetch` + `AbortSignal.timeout`,
  `DEFAULT_DIRECT_PROBE_TIMEOUT_MS = 10_000`). Use `PROBE_METHOD` /
  `PROBE_EVIDENCE` constants, not string literals.
- `packages/workflow`: `runProbeWorkflow(seed, {browserProvider, browserOptions,
timeoutMs})` — direct-first, browser only after direct failure, always closes
  page + session (`finally` on both paths).
- `packages/provider-solari`: the ONLY place that may import
  `@solarisdk/browser`. Adapts to `BrowserProbeProvider` (`name: "solari"`).
  `probe-core`, `workflow`, `registry` must compile without the Solari SDK.
- `packages/registry`: `Seed` / `RegistryEntry` / `CustomsRegistry` types +
  generator. `data/seeds.json` (8 countries) holds unverified input hypotheses;
  `portalUrl` (candidate tariff page) ≠ `sourceUrl` (authority provenance).
- `packages/shared`: cross-cutting helpers with no domain. First export:
  `projectRoot(metaUrl)` (workspace root resolution for entry scripts).
- `packages/cli`: composition root (arg parsing via `yargs`). The ONLY place
  (with `run.ts` seams) allowed to read `SOLARI_API_KEY` and construct
  `SolariBrowserProvider`. `probe-one` entry: `parseArgs` → `loadSeeds`/
  `findSeed` → `runTargets` → `formatSummary` to stdout; exit 1 on any
  `failed` result, 2 on usage errors, 0 on `--help`.
- `examples/`: upstream Solari cookbook, standalone per-example projects with
  their own `package.json` (`tsx index.ts`). Not workspace members — leave alone.
- `doc/ROADMAP.md` owns phase scope and done-criteria; `README.md` owns the
  public story. Keep both honest about what is scaffold vs working.

## Hard constraints

- `generate-registry` currently emits only `status: "unverified"` placeholders
  copied from seeds. Never present its output as verified probe data.
- `SOLARI_API_KEY` lives only at the CLI/composition root (env, optionally via
  local `.env` loaded with `node --env-file-if-exists=.env`; see root
  `.env.example`). Packages never read env or know key names. `.env` is
  gitignored.
- Solari options (`stealth`, `proxyCountry`, `captcha`) are opt-in per run, not
  defaults. Open portals must not incur proxy/browser cost without a reason.
- Evidence honesty: HTTP 200 / page load ≠ verified. Never infer CAPTCHA, WAF,
  or geo-blocking without an observation. `captchaObserved`-style values describe
  one run, not a country.

## TypeScript conventions

- Per-package `tsconfig.json`: `extends: ../../tsconfig.base.json`,
  `outDir: dist`, `rootDir: src`. `dist/` is gitignored.
- Relative imports use the `.js` suffix (`./direct-probe.js`); `import type` for
  types. Line endings are LF repo-wide (`* text=auto eol=lf` in `.gitattributes`).
