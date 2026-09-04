/**
 * CLI argument parsing. Pure and total: every branch is unit-tested, and
 * usage errors throw with a message the entry script prints to stderr.
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
 * Parse CLI arguments into structured options.
 * @param argv - Raw arguments (without node/script prefix).
 * @returns The parsed options with the ISO target uppercased.
 * @throws When the target or any flag value is missing or invalid.
 */
export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { target: "", all: false, browser: null };
  for (const arg of argv) {
    if (arg === "--all") {
      options.all = true;
    } else if (arg.startsWith("--browser=")) {
      const value = arg.slice("--browser=".length);
      if (value !== "solari") {
        throw new Error(`Unknown browser provider "${value}". ${CLI_USAGE}`);
      }
      options.browser = value;
    } else if (arg.startsWith("--timeout-ms=")) {
      const value = Number(arg.slice("--timeout-ms=".length));
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`Invalid --timeout-ms value. ${CLI_USAGE}`);
      }
      options.timeoutMs = value;
    } else if (arg === "--stealth") {
      options.stealth = true;
    } else if (arg === "--captcha") {
      options.captcha = true;
    } else if (arg.startsWith("--proxy-country=")) {
      const value = arg.slice("--proxy-country=".length).toUpperCase();
      if (value.length !== 2) {
        throw new Error(`Invalid --proxy-country value. ${CLI_USAGE}`);
      }
      options.proxyCountry = value;
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown flag "${arg}". ${CLI_USAGE}`);
    } else if (options.target !== "") {
      throw new Error(`Unexpected extra argument "${arg}". ${CLI_USAGE}`);
    } else {
      options.target = arg.toUpperCase();
    }
  }
  if (options.all) {
    if (options.target !== "") {
      throw new Error(`Pass either an ISO code or --all, not both. ${CLI_USAGE}`);
    }
    options.target = "all";
  } else if (options.target === "") {
    throw new Error(`Missing target ISO code. ${CLI_USAGE}`);
  }
  return options;
}
