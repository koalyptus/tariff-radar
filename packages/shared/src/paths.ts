import { realpathSync } from "node:fs";
import { basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Walk up from a module URL to the workspace root (the parent of `packages/`).
 * Entry scripts use it to resolve `data/` without depending on the caller's
 * working directory.
 * @param metaUrl - `import.meta.url` of the calling module.
 * @returns The workspace root directory.
 * @throws When no `packages/` ancestor exists.
 */
export function projectRoot(metaUrl: string): string {
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
