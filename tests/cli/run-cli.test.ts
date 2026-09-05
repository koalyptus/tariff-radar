import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { BrowserProbeProvider, WorkflowResult } from "@tariff-radar/probe-core";
import { noopProbeLogger } from "@tariff-radar/probe-core";
import type { Seed } from "@tariff-radar/registry";
import { runCli } from "@tariff-radar/cli";
import type { RunDeps } from "@tariff-radar/cli";

const seed: Seed = {
  isoCode: "US",
  countryName: "United States",
  authority: "USITC",
  portalUrl: "https://hts.usitc.gov/",
  sourceUrl: "https://www.usitc.gov/tariff_affairs",
};

function directResult(): WorkflowResult {
  return {
    seed: { isoCode: "US", countryName: "United States", portalUrl: seed.portalUrl, sourceUrl: seed.sourceUrl },
    method: "direct",
    provider: null,
    direct: { ok: true, status: 200, finalUrl: seed.portalUrl, latencyMs: 9, title: null, error: null },
    browser: null,
    evidence: ["direct_response"],
    error: null,
  };
}

function stubDeps(result: WorkflowResult | string): RunDeps {
  const fakeProvider: BrowserProbeProvider = {
    name: "fake",
    launch: async () => {
      throw new Error("unused");
    },
  };
  return {
    runWorkflow: (async () => {
      if (typeof result === "string") {
        throw result;
      }
      return result;
    }) as RunDeps["runWorkflow"],
    createSolariProvider: () => fakeProvider,
    readApiKey: () => "test-key",
    logger: noopProbeLogger,
  };
}

function writeSeeds(): { dir: string; seedsFile: string } {
  const dir = mkdtempSync(join(tmpdir(), "run-cli-test-"));
  const seedsFile = join(dir, "seeds.json");
  writeFileSync(seedsFile, JSON.stringify([seed]));
  return { dir, seedsFile };
}

describe("runCli", () => {
  it("returns 0 for one successful seed", async () => {
    const { dir, seedsFile } = writeSeeds();
    try {
      await expect(runCli(["US"], stubDeps(directResult()), seedsFile)).resolves.toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns 0 for JSON rendering", async () => {
    const { dir, seedsFile } = writeSeeds();
    try {
      await expect(runCli(["US", "--log=json"], stubDeps(directResult()), seedsFile)).resolves.toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns 0 probing every seed without an ISO", async () => {
    const dir = mkdtempSync(join(tmpdir(), "run-cli-test-"));
    try {
      const seedsFile = join(dir, "seeds.json");
      writeFileSync(
        seedsFile,
        JSON.stringify([
          { ...seed },
          { ...seed, isoCode: "MX", countryName: "Mexico", portalUrl: "https://www.snice.gob.mx/" },
        ]),
      );
      const queued = [
        directResult(),
        {
          ...directResult(),
          seed: {
            isoCode: "MX",
            countryName: "Mexico",
            portalUrl: "https://www.snice.gob.mx/",
            sourceUrl: seed.sourceUrl,
          },
        },
      ];
      let index = 0;
      const base = stubDeps(directResult());
      const deps: RunDeps = {
        ...base,
        runWorkflow: (async () => queued[index++]) as RunDeps["runWorkflow"],
      };
      await expect(runCli([], deps, seedsFile)).resolves.toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns 1 when a seed fails", async () => {
    const { dir, seedsFile } = writeSeeds();
    const failed: WorkflowResult = {
      ...directResult(),
      method: "failed",
      direct: { ok: false, status: null, finalUrl: null, latencyMs: 9, title: null, error: "nope" },
      evidence: [],
      error: "nope",
    };
    try {
      await expect(runCli(["US", "--browser=direct"], stubDeps(failed), seedsFile)).resolves.toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns 0 for --help without probing", async () => {
    const { dir, seedsFile } = writeSeeds();
    try {
      await expect(runCli(["--help"], stubDeps(directResult()), seedsFile)).resolves.toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns 2 on usage errors", async () => {
    const { dir, seedsFile } = writeSeeds();
    try {
      await expect(runCli(["--nope"], stubDeps(directResult()), seedsFile)).resolves.toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns 2 when the workflow throws a non-Error", async () => {
    const { dir, seedsFile } = writeSeeds();
    try {
      await expect(runCli(["US", "--browser=direct"], stubDeps("plain failure"), seedsFile)).resolves.toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
