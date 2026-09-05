import { afterEach, describe, expect, it } from "vitest";

// Entry-point error test: a separate file from probe-entry.test.ts so the
// module executes fresh with THESE argv (modules evaluate once per file).
// No fetch stub needed: strict arg parsing fails before any network use.

const savedArgv = process.argv;
const savedExit = process.exitCode;

afterEach(() => {
  process.argv = savedArgv;
  process.exitCode = savedExit;
});

describe("probe entry on usage error", () => {
  it("sets exit 2", async () => {
    process.argv = ["node", "probe.js", "--nope"];
    // Relative import on purpose: this imports the entry module itself,
    // not the `@tariff-radar/cli` barrel the alias points at.
    await import("../../packages/cli/src/probe.js");
    expect(process.exitCode).toBe(2);
  });
});
