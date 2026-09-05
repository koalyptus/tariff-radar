import { afterEach, describe, expect, it, vi } from "vitest";

// Entry-point test: importing the module executes it, so the import itself
// is dynamic and runs after fetch is stubbed and argv is fixed. Vitest
// isolates modules per file, so this execution happens exactly once.

const savedArgv = process.argv;
const savedKey = process.env.SOLARI_API_KEY;
const savedExit = process.exitCode;

afterEach(() => {
  vi.unstubAllGlobals();
  process.argv = savedArgv;
  process.exitCode = savedExit;
  if (savedKey === undefined) {
    delete process.env.SOLARI_API_KEY;
  } else {
    process.env.SOLARI_API_KEY = savedKey;
  }
});

describe("probe entry", () => {
  it("probes one seed and sets exit 0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, url: "https://hts.usitc.gov/" })),
    );
    delete process.env.SOLARI_API_KEY;
    process.argv = ["node", "probe.js", "US"];
    // Relative import on purpose: this imports the entry module itself,
    // not the `@tariff-radar/cli` barrel the alias points at.
    await import("../../packages/cli/src/probe.js");
    expect(process.exitCode).toBe(0);
  });
});
