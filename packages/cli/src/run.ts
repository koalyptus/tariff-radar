import pLimit from "p-limit";
import { consoleProbeLogger } from "@tariff-radar/probe-core";
import type { BrowserProbeProvider, LogFields, ProbeLogger, WorkflowResult } from "@tariff-radar/probe-core";

/** Log levels the scoped per-seed logger records. */
type LogLevel = "debug" | "info" | "warn" | "error";
import { SolariBrowserProvider } from "@tariff-radar/provider-solari";
import type { Seed } from "@tariff-radar/registry";
import { runProbeWorkflow } from "@tariff-radar/workflow";
import type { CliOptions } from "./args.js";
import { BROWSER_MODE, DEFAULT_CONCURRENCY } from "./args.js";
import { findSeed } from "./seeds.js";

/**
 * Composition-root orchestration: pick targets, build the optional browser
 * provider, and run the workflow once per seed. Side-effect-free apart from
 * the injected seams, so tests stub every seam without network access.
 */

/** Injectable seams; the entry script wires the real implementations. */
export interface RunDeps {
  /** Workflow runner (real `runProbeWorkflow`, or a stub in tests). */
  runWorkflow: typeof runProbeWorkflow;
  /** Solari provider factory (keeps the SDK constructible without a key). */
  createSolariProvider: (apiKey: string) => BrowserProbeProvider;
  /** API key source; defaults to `process.env.SOLARI_API_KEY`. */
  readApiKey: () => string | undefined;
  /** Structured logger forwarded to the workflow. */
  logger: ProbeLogger;
}

/**
 * Build the production seams. The ONLY place that reads `SOLARI_API_KEY`;
 * packages never touch it directly.
 * @returns Production dependency implementations.
 */
export function defaultDeps(): RunDeps {
  return {
    runWorkflow: runProbeWorkflow,
    createSolariProvider: (apiKey) => new SolariBrowserProvider({ apiKey }),
    readApiKey: () => process.env.SOLARI_API_KEY,
    logger: consoleProbeLogger,
  };
}

/**
 * Probe the seeds selected by the CLI options with bounded concurrency.
 * Results stay in seed order; progress lines may interleave above 1.
 * @param seeds - Candidate seeds in file order.
 * @param options - Parsed CLI options selecting targets and provider.
 * @param deps - Injectable runner, provider factory, key source, and logger.
 * @returns One workflow result per probed seed, in order.
 * @throws When the ISO code is unknown or the Solari key is missing.
 */
export async function runTargets(seeds: Seed[], options: CliOptions, deps: RunDeps): Promise<WorkflowResult[]> {
  const targets = options.all ? seeds : [findSeed(seeds, options.target)];
  // Bare `pnpm probe` defaults to the Solari fallback; `--browser=direct`
  // forces direct-only. A missing key is fatal only when explicitly asked
  // for — by default we warn loudly and continue direct-only.
  const browser = options.browser ?? BROWSER_MODE.SOLARI;
  let browserProvider: BrowserProbeProvider | undefined;
  if (browser === BROWSER_MODE.SOLARI) {
    const apiKey = deps.readApiKey();
    if (!apiKey) {
      if (options.browser !== null) {
        throw new Error("SOLARI_API_KEY is not set. Export it or add it to .env (see .env.example).");
      }
      deps.logger.warn("SOLARI_API_KEY is not set — continuing direct-only.");
    } else {
      browserProvider = deps.createSolariProvider(apiKey);
    }
  }
  const limit = pLimit(options.concurrency ?? DEFAULT_CONCURRENCY);
  const tasks = targets.map((seed) =>
    limit(async () => {
      // Buffer one seed's lines and print them as a block on completion:
      // concurrent seeds must not interleave mid-story.
      const recorded: Array<{ level: LogLevel; message: string; fields?: LogFields }> = [];
      const scoped = {} as ProbeLogger;
      for (const level of ["debug", "info", "warn", "error"] as const) {
        scoped[level] = (message, fields) => {
          recorded.push({ level, message, fields });
        };
      }
      const result = await deps.runWorkflow(seed, {
        browserProvider,
        browserOptions: {
          stealth: options.stealth,
          proxyCountry: options.proxyCountry,
          captcha: options.captcha,
        },
        timeoutMs: options.timeoutMs,
        logger: scoped,
      });
      for (const call of recorded) {
        deps.logger[call.level](call.message, call.fields);
      }
      return result;
    }),
  );
  return Promise.all(tasks);
}
