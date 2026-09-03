# AGENTS.md — tariff-radar

pnpm monorepo (`packages/*`). ESM (`"type": "module"`), strict TS on `NodeNext`
module + resolution, shared base in `tsconfig.base.json`.

## Commands (pnpm only)

- `pnpm install`
- `pnpm typecheck` (`pnpm -r typecheck`) and `pnpm build` (`pnpm -r build`)
- `pnpm --filter @tariff-radar/registry generate-registry` → runs
  `tsx src/generate-registry.ts`, writes `data/customs_registry.json`
- No `test`, `lint`, or formatter scripts exist (Vitest is roadmap Phase 1/5,
  not installed). Do not invent `pnpm test`.

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
- `examples/`: upstream Solari cookbook, standalone per-example projects with
  their own `package.json` (`tsx index.ts`). Not workspace members — leave alone.
- `doc/ROADMAP.md` owns phase scope and done-criteria; `README.md` owns the
  public story. Keep both honest about what is scaffold vs working.

## Hard constraints

- `generate-registry` currently emits only `status: "unverified"` placeholders
  copied from seeds. Never present its output as verified probe data.
- `SOLARI_API_KEY` lives only at the CLI/composition root (env). Packages never
  read env or know key names. `.env` is gitignored; no root `.env.example` until
  a credentialed CLI exists.
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
