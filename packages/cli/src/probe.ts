import { join } from "node:path";
import { PROBE_METHOD, consoleProbeLogger } from "@tariff-radar/probe-core";
import { projectRoot } from "@tariff-radar/shared";
import { parseArgs, HelpRequested } from "./args.js";
import { humanProbeLogger } from "./progress.js";
import { defaultDeps, runTargets } from "./run.js";
import { loadSeeds } from "./seeds.js";
import { formatTable } from "./summary.js";

/**
 * Single-seed / all-seed probe entry point. Composition root: the ONLY place
 * (besides `run.ts` seams) that touches `process.env`, the filesystem, and
 * the Solari provider. Excluded from unit coverage like the registry
 * generator; exercised by real runs, not stubbed tests.
 */

try {
  const options = parseArgs(process.argv.slice(2));
  const dataDir = join(projectRoot(import.meta.url), "data");
  const seeds = await loadSeeds(join(dataDir, "seeds.json"));
  const total = options.all ? seeds.length : 1;
  const deps = {
    ...defaultDeps(),
    logger: options.log === "json" ? consoleProbeLogger : humanProbeLogger((line) => console.error(line)),
  };
  if (options.log !== "json") {
    console.error(`Direct probe: STARTING — ${String(total)} portal${total === 1 ? "" : "s"}`);
  }
  const results = await runTargets(seeds, options, deps);
  console.log(formatTable(results));
  if (options.log !== "json") {
    const direct = results.filter((result) => result.method === PROBE_METHOD.DIRECT).length;
    const browser = results.filter((result) => result.method === PROBE_METHOD.BROWSER).length;
    const failed = results.length - direct - browser;
    console.error(
      `Direct probe: COMPLETED — ${String(direct)} direct, ${String(browser)} browser, ${String(failed)} failed`,
    );
  }
  if (results.some((result) => result.method === PROBE_METHOD.FAILED)) {
    process.exitCode = 1;
  }
} catch (error) {
  if (error instanceof HelpRequested) {
    // yargs already printed the help text; usage was not an error.
    process.exitCode = 0;
  } else {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}
