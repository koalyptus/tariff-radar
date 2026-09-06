import { join } from "node:path";
import yargs from "yargs";
import { PROBE_METHOD, consoleProbeLogger, progressLogger } from "@tariff-radar/probe-core";
import { SolariBrowserProvider } from "@tariff-radar/provider-solari";
import { loadSeeds, mapWorkflowResultsToEntries, runWriteRegistry } from "@tariff-radar/registry";
import { projectDataDir } from "@tariff-radar/shared";
import { probeTargets, probeWorkflow } from "@tariff-radar/workflow";
import type { RunDeps } from "@tariff-radar/workflow";
import { BROWSER_MODE, MAX_CONCURRENCY } from "@tariff-radar/workflow";
import type { BrowserMode } from "@tariff-radar/workflow";
import { stdioOutput } from "../output.js";
import type { RunCliOutput } from "../output.js";
import { formatTable } from "../summary.js";

/**
 * CLI argument parsing via yargs. The framework owns tokenizing, types,
 * `--browser` choices, unknown-flag rejection, and `--help` text; the
 * semantic rules (one target, value ranges) below keep stable messages the
 * entry script prints to stderr. Pure and throwing, so tests stay hermetic.
 */
export interface CliOptions {
  /** Uppercase ISO code for one seed, or `"all"` when no ISO is given. */
  target: string;
  /** Probe every seed in `data/seeds.json` instead of one. */
  all: boolean;
  /** Browser fallback mode, `direct` disables it, null means default. */
  browser: BrowserMode | null;
  /** Direct-probe timeout override in milliseconds. */
  timeoutMs?: number;
  /** Opt-in provider stealth/anti-detection measures. */
  stealth?: boolean;
  /** Opt-in two-letter proxy egress country code. */
  proxyCountry?: string;
  /** Opt-in provider CAPTCHA handling where the target's terms permit it. */
  captcha?: boolean;
  /** Progress rendering: pretty stage lines (default) or JSON lines. */
  log: "pretty" | "json";
  /** Max parallel seed probes (default `DEFAULT_CONCURRENCY`). */
  concurrency?: number;
}

export const CLI_USAGE =
  "Usage: pnpm probe [ISO] [--browser=solari] [--timeout-ms=N] [--stealth] [--proxy-country=XX] [--captcha] [--log=json] [--concurrency=N]";

/**
 * Narrow yargs result to the flags this CLI declares. The `@types/yargs`
 * inference widens chained option types, so the boundary is cast once here
 * instead of narrowing at every use site.
 */
interface ParsedFlags {
  browser?: BrowserMode;
  timeoutMs?: number;
  stealth?: boolean;
  proxyCountry?: string;
  captcha?: boolean;
  log: "pretty" | "json";
  concurrency?: number;
  iso?: string;
  help?: boolean;
}

/**
 * Thrown when `--help` is passed. yargs already printed the help text, so
 * the entry script exits 0 without printing anything else.
 */
export class HelpRequested extends Error {
  constructor() {
    super("help requested");
  }
}

/**
 * Parse the probe command's arguments into structured options. One parser
 * per command: a future command adds its own `parseXArgs` beside this one
 * instead of growing a shared flag bag.
 * @param argv - Raw arguments (without node/script prefix).
 * @returns The parsed options with the ISO target uppercased.
 * @throws When the target or any flag value is missing or invalid, or when
 * `--help` is passed ({@link HelpRequested}).
 */
export function parseProbeArgs(argv: string[]): CliOptions {
  const parsed = yargs(argv)
    .scriptName("probe")
    .usage("Usage: pnpm probe [ISO] [options]")
    .command(
      "$0 [iso]",
      "Probe one portal candidate direct-first, with optional Solari fallback after direct failure. Without an ISO, probes every seed.",
      (cmd) => cmd.positional("iso", { describe: "ISO country code of one seed.", type: "string" }),
    )
    .option("browser", {
      choices: [BROWSER_MODE.DIRECT, BROWSER_MODE.SOLARI],
      describe: "Browser fallback after direct failure (default solari); direct disables it.",
    })
    .option("timeout-ms", { type: "number", describe: "Direct-probe timeout in milliseconds." })
    .option("stealth", { type: "boolean", describe: "Opt-in provider stealth/anti-detection measures." })
    .option("proxy-country", { type: "string", describe: "Opt-in two-letter proxy egress country code." })
    .option("captcha", {
      type: "boolean",
      describe: "Opt-in provider CAPTCHA handling where the target's terms permit it.",
    })
    .option("log", {
      choices: ["pretty", "json"] as const,
      default: "pretty",
      describe: "Progress rendering: pretty stage lines on stderr, or JSON lines.",
    })
    .option("concurrency", { type: "number", describe: "Max parallel seed probes (default 6)." })
    .strict()
    .help()
    .version(false)
    .exitProcess(false)
    .fail((msg, err) => {
      throw err ?? new Error(msg);
    })
    .parseSync() as ParsedFlags;
  if (parsed.help) {
    throw new HelpRequested();
  }
  const iso = parsed.iso?.toUpperCase() ?? "";
  const all = iso === "";
  const timeoutMs = parsed.timeoutMs;
  if (timeoutMs !== undefined && (!Number.isInteger(timeoutMs) || timeoutMs <= 0)) {
    throw new Error(`Invalid --timeout-ms value. ${CLI_USAGE}`);
  }
  const rawProxy = parsed.proxyCountry;
  if (rawProxy !== undefined && rawProxy.toUpperCase().length !== 2) {
    throw new Error(`Invalid --proxy-country value. ${CLI_USAGE}`);
  }
  const proxyCountry = rawProxy?.toUpperCase();
  const concurrency = parsed.concurrency;
  if (
    concurrency !== undefined &&
    (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > MAX_CONCURRENCY)
  ) {
    throw new Error(`Invalid --concurrency value (1-${String(MAX_CONCURRENCY)}). ${CLI_USAGE}`);
  }
  const options: CliOptions = {
    target: all ? "all" : iso,
    all,
    browser: parsed.browser ?? null,
    log: parsed.log,
  };
  if (timeoutMs !== undefined) {
    options.timeoutMs = timeoutMs;
  }
  if (parsed.stealth !== undefined) {
    options.stealth = parsed.stealth;
  }
  if (proxyCountry !== undefined) {
    options.proxyCountry = proxyCountry;
  }
  if (parsed.captcha !== undefined) {
    options.captcha = parsed.captcha;
  }
  if (concurrency !== undefined) {
    options.concurrency = concurrency;
  }
  return options;
}

/**
 * Build the production seams. The ONLY place that reads `SOLARI_API_KEY`;
 * packages never touch it directly.
 * @returns Production dependency implementations.
 */
export function defaultDeps(): RunDeps {
  return {
    probeWorkflow,
    createSolariProvider: (apiKey) => new SolariBrowserProvider({ apiKey }),
    readApiKey: () => process.env.SOLARI_API_KEY,
    logger: consoleProbeLogger,
  };
}

/**
 * Run the probe command and report the exit code. All command output flows
 * through the injected {@link RunCliOutput}: the table, the progress
 * brackets, and the per-seed stage blocks. The injected {@link ProbeLogger}
 * only ever carries probe events, never this chrome — `--log=json`
 * therefore stays machine-readable.
 * @param argv - Raw arguments (without node/script prefix).
 * @param deps - Injectable seams; production defaults read env and network.
 * @param seedsFile - Seeds path override for tests; defaults to workspace data.
 * @param registryFile - Registry path override for tests; defaults to workspace `data/customs_registry.json`.
 * @param output - Injectable sinks; production defaults write stdio.
 * @returns Process exit code: 0 ok, 1 on any failed result, 2 on usage errors.
 */
export async function runProbeCommand(
  argv: string[],
  deps: RunDeps = defaultDeps(),
  seedsFile?: string,
  registryFile?: string,
  output: RunCliOutput = stdioOutput(),
): Promise<number> {
  try {
    const options = parseProbeArgs(argv);
    const seeds = await loadSeeds(seedsFile ?? join(projectDataDir(import.meta.url), "seeds.json"));
    const total = options.all ? seeds.length : 1;
    const startedAt = performance.now();
    const logger = options.log === "pretty" ? progressLogger(output.printProgress) : consoleProbeLogger;
    if (options.log === "pretty") {
      output.printProgress(`Probe: STARTING — ${String(total)} portal${total === 1 ? "" : "s"}`);
    }
    const results = await probeTargets(seeds, options, { ...deps, logger });
    output.printTable(formatTable(results));
    if (options.log === "pretty") {
      const direct = results.filter((result) => result.method === PROBE_METHOD.DIRECT).length;
      const browser = results.filter((result) => result.method === PROBE_METHOD.BROWSER).length;
      const failed = results.length - direct - browser;
      const elapsed = ((performance.now() - startedAt) / 1000).toFixed(1);
      output.printProgress(
        `Probe: COMPLETED in ${elapsed}s — ${String(direct)} direct, ${String(browser)} browser, ${String(failed)} failed`,
      );
    }
    const registryPath = await runWriteRegistry(
      mapWorkflowResultsToEntries(results, new Date().toISOString()),
      registryFile ?? join(projectDataDir(import.meta.url), "customs_registry.json"),
    );
    if (options.log === "pretty") {
      output.printProgress(`Registry: wrote ${String(results.length)} entries at ${registryPath}`);
    }
    return results.some((result) => result.method === PROBE_METHOD.FAILED) ? 1 : 0;
  } catch (error) {
    if (error instanceof HelpRequested) {
      // yargs already printed the help text; usage was not an error.
      return 0;
    }
    output.printError(error instanceof Error ? error.message : String(error));
    return 2;
  }
}
