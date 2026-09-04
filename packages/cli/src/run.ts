import { consoleProbeLogger } from "@tariff-radar/probe-core";
import type { BrowserProbeProvider, ProbeLogger, WorkflowResult } from "@tariff-radar/probe-core";
import { SolariBrowserProvider } from "@tariff-radar/provider-solari";
import type { Seed } from "@tariff-radar/registry";
import { runProbeWorkflow } from "@tariff-radar/workflow";
import type { CliOptions } from "./args.js";
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
 * Probe the seeds selected by the CLI options.
 * @param seeds - Candidate seeds in file order.
 * @param options - Parsed CLI options selecting targets and provider.
 * @param deps - Injectable runner, provider factory, key source, and logger.
 * @returns One workflow result per probed seed, in order.
 * @throws When the ISO code is unknown or the Solari key is missing.
 */
export async function runTargets(seeds: Seed[], options: CliOptions, deps: RunDeps): Promise<WorkflowResult[]> {
  const targets = options.all ? seeds : [findSeed(seeds, options.target)];
  let browserProvider: BrowserProbeProvider | undefined;
  if (options.browser === "solari") {
    const apiKey = deps.readApiKey();
    if (!apiKey) {
      throw new Error("SOLARI_API_KEY is not set. Export it or add it to .env (see .env.example).");
    }
    browserProvider = deps.createSolariProvider(apiKey);
  }
  const results: WorkflowResult[] = [];
  for (const seed of targets) {
    results.push(
      await deps.runWorkflow(seed, {
        browserProvider,
        browserOptions: {
          stealth: options.stealth,
          proxyCountry: options.proxyCountry,
          captcha: options.captcha,
        },
        timeoutMs: options.timeoutMs,
        logger: deps.logger,
      }),
    );
  }
  return results;
}
