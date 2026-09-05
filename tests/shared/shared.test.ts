import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { projectRoot } from "../../packages/shared/src/index.js";

describe("projectRoot", () => {
  it("resolves the parent of the packages directory", () => {
    const root = mkdtempSync(join(tmpdir(), "shared-test-"));
    try {
      const nested = join(root, "packages", "some-pkg", "src");
      mkdirSync(nested, { recursive: true });
      const entry = join(nested, "index.ts");
      writeFileSync(entry, "");
      expect(projectRoot(pathToFileURL(entry).href)).toBe(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("throws when no packages ancestor exists", () => {
    const root = mkdtempSync(join(tmpdir(), "shared-test-"));
    try {
      const entry = join(root, "lonely.ts");
      writeFileSync(entry, "");
      expect(() => projectRoot(pathToFileURL(entry).href)).toThrow("Could not determine project root");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
