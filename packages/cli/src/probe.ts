import { join } from "node:path";
import { PROBE_METHOD } from "@tariff-radar/probe-core";
import { projectRoot } from "@tariff-radar/shared";
import { parseArgs, HelpRequested } from "./args.js";
import { defaultDeps, runTargets } from "./run.js";
import { loadSeeds } from "./seeds.js";
import { formatSummary } from "./summary.js";

/**
 * Single-seed / all-seed probe entry point. Composition root: the ONLY place
 * (besides `run.ts` seams) that touches `process.env`, the filesystem, and
 * the Solari provider. Excluded from unit coverage like the registry
 * generator; exercised by real runs, not stubbed tests.
 */

try {
  const options = parseArgs(process.argv.slice(2));
  const dataDir = join(projectRoot(import.meta.url), "data");
  const results = await runTargets(await loadSeeds(join(dataDir, "seeds.json")), options, defaultDeps());
  for (const result of results) {
    console.log(formatSummary(result));
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
