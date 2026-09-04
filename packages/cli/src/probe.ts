import { realpathSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PROBE_METHOD } from "@tariff-radar/probe-core";
import { parseArgs } from "./args.js";
import { defaultDeps, runTargets } from "./run.js";
import { loadSeeds } from "./seeds.js";
import { formatSummary } from "./summary.js";

/**
 * Single-seed / all-seed probe entry point. Composition root: the ONLY place
 * (besides `run.ts` seams) that touches `process.env`, the filesystem, and
 * the Solari provider. Excluded from unit coverage like the registry
 * generator; exercised by real runs, not stubbed tests.
 */

// TODO: share the workspace-root walk with generate-registry when a third
// consumer needs it.
function projectRoot(metaUrl: string): string {
  let dir = dirname(realpathSync(fileURLToPath(metaUrl)));
  while (true) {
    if (basename(dir) === "packages") {
      return dirname(dir);
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error("Could not determine project root");
    }
    dir = parent;
  }
}

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
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
