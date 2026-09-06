import pLimit from "p-limit";
import type {
  BrowserProbeOptions,
  BrowserProbeProvider,
  LogFields,
  ProbeLogger,
  WorkflowResult,
} from "@tariff-radar/probe-core";
import { probeWorkflow } from "./probe-workflow.js";
import type { WorkflowSeed } from "./probe-workflow.js";

/**
 * Browser fallback vocabulary for target probing. Use these constants, never
 * string literals, so a rename breaks the build instead of behavior.
 */
export const BROWSER_MODE = {
  DIRECT: "direct",
  SOLARI: "solari",
} as const;

/** One of the {@link BROWSER_MODE} values. */
export type BrowserMode = (typeof BROWSER_MODE)[keyof typeof BROWSER_MODE];

/** Default parallel seed probes. */
export const DEFAULT_CONCURRENCY = 6;

/** Upper bound for concurrency: one in-flight probe per demo seed. */
export const MAX_CONCURRENCY = 8;

/** Options for probing a set of seeds. */
export interface TargetProbeOptions {
  /** Probe every seed instead of one. */
  all: boolean;
  /** Uppercase ISO code for one seed. */
  target: string;
  /** Browser fallback mode; `direct` disables it, null means default. */
  browser: BrowserMode | null;
  /** Opt-in provider stealth/anti-detection measures. */
  stealth?: boolean;
  /** Opt-in two-letter proxy egress country code. */
  proxyCountry?: string;
  /** Opt-in provider CAPTCHA handling where the target's terms permit it. */
  captcha?: boolean;
  /** Direct-probe timeout override in milliseconds. */
  timeoutMs?: number;
  /** Max parallel seed probes. */
  concurrency?: number;
}

/** Injectable seams; tests stub every seam without network access. */
export interface RunDeps {
  /** Workflow runner (real `probeWorkflow`, or a stub in tests). */
  probeWorkflow: typeof probeWorkflow;
  /** Solari provider factory (keeps the SDK constructible without a key). */
  createSolariProvider: (apiKey: string) => BrowserProbeProvider;
  /** API key source; defaults to `process.env.SOLARI_API_KEY`. */
  readApiKey: () => string | undefined;
  /** Structured logger forwarded to the workflow. */
  logger: ProbeLogger;
}

/** Log levels the scoped per-seed logger records. */
type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Probe the selected seeds with bounded concurrency. Results and log blocks
 * always come out in seed order. Failures are returned, never thrown — only
 * an unknown ISO code or a missing explicitly-requested key throws.
 * @param seeds - Candidate seeds in file order.
 * @param options - Target selection, provider, and concurrency options.
 * @param deps - Injectable runner, provider factory, key source, and logger.
 * @returns One workflow result per probed seed, in order.
 * @throws When the ISO code is unknown or the Solari key is missing.
 */
export async function probeTargets(
  seeds: WorkflowSeed[],
  options: TargetProbeOptions,
  deps: RunDeps,
): Promise<WorkflowResult[]> {
  const targets = options.all ? seeds : [findTarget(seeds, options.target)];
  // A null browser means default (solari); `direct` forces direct-only. A
  // missing key is fatal only when explicitly asked for — by default we warn
  // loudly and continue direct-only.
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
  const browserOptions: BrowserProbeOptions = {
    stealth: options.stealth,
    proxyCountry: options.proxyCountry,
    captcha: options.captcha,
  };
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
      const result = await deps.probeWorkflow(seed, {
        browserProvider,
        browserOptions,
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

/**
 * Select one seed by ISO code (case-insensitive).
 * @param seeds - Candidate seeds in file order.
 * @param isoCode - ISO country code to match.
 * @returns The matching seed.
 * @throws When no seed carries the ISO code.
 */
function findTarget(seeds: WorkflowSeed[], isoCode: string): WorkflowSeed {
  const upper = isoCode.toUpperCase();
  const seed = seeds.find((candidate) => candidate.isoCode.toUpperCase() === upper);
  if (!seed) {
    throw new Error(`Unknown ISO code "${isoCode}".`);
  }
  return seed;
}
