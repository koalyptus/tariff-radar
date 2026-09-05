import { join } from "node:path";
import { PROBE_METHOD, consoleProbeLogger } from "@tariff-radar/probe-core";
import { projectDataDir } from "@tariff-radar/shared";
import { parseProbeArgs, HelpRequested } from "./args.js";
import { progressLogger } from "./progress.js";
import { defaultDeps, runTargets } from "./run.js";
import type { RunDeps } from "./run.js";
import { loadSeeds } from "./seeds.js";
import { formatTable } from "./summary.js";

/**
 * Run the probe command and report the exit code. All CLI output routing
 * lives here, in one place: the results table goes to stdout so it stays
 * pipeable (`pnpm probe > results.txt`), while human progress chrome
 * (STARTING/COMPLETED brackets, stage lines) and usage errors go to stderr.
 * The injected {@link ProbeLogger} only ever carries probe events, never
 * this chrome — `--log=json` therefore stays machine-readable.
 * @param argv - Raw arguments (without node/script prefix).
 * @param deps - Injectable seams; production defaults read env and network.
 * @param seedsFile - Seeds path override for tests; defaults to workspace data.
 * @returns Process exit code: 0 ok, 1 on any failed result, 2 on usage errors.
 */
export async function runCli(argv: string[], deps: RunDeps = defaultDeps(), seedsFile?: string): Promise<number> {
  try {
    const options = parseProbeArgs(argv);
    const seeds = await loadSeeds(seedsFile ?? join(projectDataDir(import.meta.url), "seeds.json"));
    const total = options.all ? seeds.length : 1;
    const startedAt = performance.now();
    const logger = options.log === "pretty" ? progressLogger((line) => console.error(line)) : consoleProbeLogger;
    if (options.log === "pretty") {
      console.error(`Probe: STARTING — ${String(total)} portal${total === 1 ? "" : "s"}`);
    }
    const results = await runTargets(seeds, options, { ...deps, logger });
    console.log(formatTable(results));
    if (options.log === "pretty") {
      const direct = results.filter((result) => result.method === PROBE_METHOD.DIRECT).length;
      const browser = results.filter((result) => result.method === PROBE_METHOD.BROWSER).length;
      const failed = results.length - direct - browser;
      const elapsed = ((performance.now() - startedAt) / 1000).toFixed(1);
      console.error(
        `Probe: COMPLETED in ${elapsed}s — ${String(direct)} direct, ${String(browser)} browser, ${String(failed)} failed`,
      );
    }
    return results.some((result) => result.method === PROBE_METHOD.FAILED) ? 1 : 0;
  } catch (error) {
    if (error instanceof HelpRequested) {
      // yargs already printed the help text; usage was not an error.
      return 0;
    }
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
}
