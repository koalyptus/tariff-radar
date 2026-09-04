import yargs from "yargs";

/**
 * CLI argument parsing via yargs. The framework owns tokenizing, types,
 * `--browser` choices, unknown-flag rejection, and `--help` text; the
 * semantic rules (one target, value ranges) below keep stable messages the
 * entry script prints to stderr. Pure and throwing, so tests stay hermetic.
 */
export interface CliOptions {
  /** Uppercase ISO code for one seed, or `"all"` when `--all` is given. */
  target: string;
  /** Probe every seed in `data/seeds.json` instead of one. */
  all: boolean;
  /** Browser provider name, or null for direct-only (no credentials needed). */
  browser: "solari" | null;
  /** Direct-probe timeout override in milliseconds. */
  timeoutMs?: number;
  /** Opt-in provider stealth/anti-detection measures. */
  stealth?: boolean;
  /** Opt-in two-letter proxy egress country code. */
  proxyCountry?: string;
  /** Opt-in provider CAPTCHA handling where the target's terms permit it. */
  captcha?: boolean;
}

export const CLI_USAGE =
  "Usage: pnpm probe <ISO | --all> [--browser=solari] [--timeout-ms=N] [--stealth] [--proxy-country=XX] [--captcha]";

/**
 * Narrow yargs result to the flags this CLI declares. The `@types/yargs`
 * inference widens chained option types, so the boundary is cast once here
 * instead of narrowing at every use site.
 */
interface ParsedFlags {
  all: boolean;
  browser?: "solari";
  timeoutMs?: number;
  stealth?: boolean;
  proxyCountry?: string;
  captcha?: boolean;
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
 * Parse CLI arguments into structured options.
 * @param argv - Raw arguments (without node/script prefix).
 * @returns The parsed options with the ISO target uppercased.
 * @throws When the target or any flag value is missing or invalid, or when
 * `--help` is passed ({@link HelpRequested}).
 */
export function parseArgs(argv: string[]): CliOptions {
  const parsed = yargs(argv)
    .scriptName("probe")
    .usage("Usage: pnpm probe <ISO | --all> [options]")
    .command(
      "$0 [iso]",
      "Probe one portal candidate direct-first, with optional Solari fallback after direct failure.",
      (cmd) => cmd.positional("iso", { describe: "ISO country code of one seed.", type: "string" }),
    )
    .option("all", { type: "boolean", default: false, describe: "Probe every seed in data/seeds.json." })
    .option("browser", {
      choices: ["solari"] as const,
      describe: "Browser provider for fallback after direct failure.",
    })
    .option("timeout-ms", { type: "number", describe: "Direct-probe timeout in milliseconds." })
    .option("stealth", { type: "boolean", describe: "Opt-in provider stealth/anti-detection measures." })
    .option("proxy-country", { type: "string", describe: "Opt-in two-letter proxy egress country code." })
    .option("captcha", {
      type: "boolean",
      describe: "Opt-in provider CAPTCHA handling where the target's terms permit it.",
    })
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
  const target = parsed.iso?.toUpperCase() ?? "";
  if (parsed.all && target !== "") {
    throw new Error(`Pass either an ISO code or --all, not both. ${CLI_USAGE}`);
  }
  if (!parsed.all && target === "") {
    throw new Error(`Missing target ISO code. ${CLI_USAGE}`);
  }
  const timeoutMs = parsed.timeoutMs;
  if (timeoutMs !== undefined && (!Number.isInteger(timeoutMs) || timeoutMs <= 0)) {
    throw new Error(`Invalid --timeout-ms value. ${CLI_USAGE}`);
  }
  const rawProxy = parsed.proxyCountry;
  if (rawProxy !== undefined && rawProxy.toUpperCase().length !== 2) {
    throw new Error(`Invalid --proxy-country value. ${CLI_USAGE}`);
  }
  const proxyCountry = rawProxy?.toUpperCase();
  const options: CliOptions = { target: parsed.all ? "all" : target, all: parsed.all, browser: parsed.browser ?? null };
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
  return options;
}
