import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { BrowserProbeProvider, WorkflowResult } from "@tariff-radar/probe-core";
import { noopProbeLogger } from "@tariff-radar/probe-core";
import type { Seed } from "@tariff-radar/registry";
import { runProbeCommand, defaultDeps } from "@tariff-radar/cli";
import type { RunCliOutput } from "@tariff-radar/cli";
import type { RunDeps } from "@tariff-radar/workflow";

const seed: Seed = {
  isoCode: "US",
  countryName: "United States",
  authority: "USITC",
  portalUrl: "https://hts.usitc.gov/",
  sourceUrl: "https://www.usitc.gov/tariff_affairs",
};

function directResult(): WorkflowResult {
  return {
    seed: {
      isoCode: "US",
      countryName: "United States",
      authority: "USITC",
      portalUrl: seed.portalUrl,
      sourceUrl: seed.sourceUrl,
    },
    method: "direct",
    provider: null,
    direct: { ok: true, status: 200, finalUrl: seed.portalUrl, latencyMs: 9, title: null, attempts: 1, error: null },
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
    probeWorkflow: (async () => {
      if (typeof result === "string") {
        throw result;
      }
      return result;
    }) as RunDeps["probeWorkflow"],
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

function recordOutput(): {
  output: RunCliOutput;
  tables: string[];
  progress: string[];
  errors: string[];
} {
  const tables: string[] = [];
  const progress: string[] = [];
  const errors: string[] = [];
  return {
    tables,
    progress,
    errors,
    output: {
      printTable: (text) => {
        tables.push(text);
      },
      printProgress: (line) => {
        progress.push(line);
      },
      printError: (message) => {
        errors.push(message);
      },
    },
  };
}

describe("runProbeCommand", () => {
  it("returns 0 for one successful seed", async () => {
    const { dir, seedsFile } = writeSeeds();
    const recorded = recordOutput();
    try {
      const registryFile = join(dir, "registry.json");
      await expect(
        runProbeCommand(["US"], stubDeps(directResult()), seedsFile, registryFile, recorded.output),
      ).resolves.toBe(0);
      expect(recorded.tables).toHaveLength(1);
      expect(recorded.tables[0]).toContain("US");
      expect(recorded.progress[0]).toContain("Probe: STARTING");
      expect(recorded.progress.some((l) => l.includes("Probe: COMPLETED"))).toBe(true);
      expect(recorded.progress.some((l) => l.includes("Registry: wrote"))).toBe(true);
      expect(recorded.progress.some((l) => l.includes("Review: wrote 1 entries"))).toBe(true);
      const review = JSON.parse(readFileSync(join(dir, "needs_review.json"), "utf8")) as {
        entries: unknown[];
      };
      expect(review.entries).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("defaults to the workspace seeds file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "run-cli-test-"));
    const recorded = recordOutput();
    try {
      await expect(
        runProbeCommand(["US"], stubDeps(directResult()), undefined, join(dir, "registry.json"), recorded.output),
      ).resolves.toBe(0);
      expect(recorded.tables).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns 0 for JSON rendering", async () => {
    const { dir, seedsFile } = writeSeeds();
    const recorded = recordOutput();
    try {
      await expect(
        runProbeCommand(
          ["US", "--log=json"],
          stubDeps(directResult()),
          seedsFile,
          join(dir, "registry.json"),
          recorded.output,
        ),
      ).resolves.toBe(0);
      expect(recorded.tables).toHaveLength(1);
      expect(recorded.progress).toEqual([]);
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
            authority: "SE",
            portalUrl: "https://www.snice.gob.mx/",
            sourceUrl: seed.sourceUrl,
          },
        },
      ];
      let index = 0;
      const base = stubDeps(directResult());
      const deps: RunDeps = {
        ...base,
        probeWorkflow: (async () => queued[index++]) as RunDeps["probeWorkflow"],
      };
      await expect(
        runProbeCommand([], deps, seedsFile, join(dir, "registry.json"), recordOutput().output),
      ).resolves.toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns 1 when a seed fails", async () => {
    const { dir, seedsFile } = writeSeeds();
    const failed: WorkflowResult = {
      ...directResult(),
      method: "failed",
      direct: { ok: false, status: null, finalUrl: null, latencyMs: 9, title: null, attempts: 1, error: "nope" },
      evidence: [],
      error: "nope",
    };
    try {
      await expect(
        runProbeCommand(
          ["US", "--browser=direct"],
          stubDeps(failed),
          seedsFile,
          join(dir, "registry.json"),
          recordOutput().output,
        ),
      ).resolves.toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("leaves content-relevant browser runs out of triage", async () => {
    const { dir, seedsFile } = writeSeeds();
    const recorded = recordOutput();
    const relevant: WorkflowResult = {
      ...directResult(),
      method: "browser",
      provider: "fake",
      direct: { ok: false, status: null, finalUrl: null, latencyMs: 7, title: null, attempts: 1, error: "nope" },
      browser: {
        status: 200,
        finalUrl: seed.portalUrl,
        title: "Tariff portal",
        text: "customs duty",
        latencyMs: 11,
      },
      evidence: ["browser_response", "browser_text", "tariff_keyword", "customs_keyword", "duty_keyword"],
      error: null,
    };
    try {
      await expect(
        runProbeCommand(["US"], stubDeps(relevant), seedsFile, join(dir, "registry.json"), recorded.output),
      ).resolves.toBe(0);
      expect(recorded.progress.some((l) => l.includes("Review: wrote 0 entries"))).toBe(true);
      const review = JSON.parse(readFileSync(join(dir, "needs_review.json"), "utf8")) as {
        entries: unknown[];
      };
      expect(review.entries).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("honours an explicit review-file override", async () => {
    const { dir, seedsFile } = writeSeeds();
    const recorded = recordOutput();
    try {
      const reviewFile = join(dir, "custom-review.json");
      await expect(
        runProbeCommand(
          ["US"],
          stubDeps(directResult()),
          seedsFile,
          join(dir, "registry.json"),
          recorded.output,
          reviewFile,
        ),
      ).resolves.toBe(0);
      const review = JSON.parse(readFileSync(reviewFile, "utf8")) as { entries: unknown[] };
      expect(review.entries).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("defaults to workspace data files when no paths are given", async () => {
    const { dir, seedsFile } = writeSeeds();
    const dataDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "data");
    const registryOut = join(dataDir, "customs_registry.json");
    const reviewOut = join(dataDir, "needs_review.json");
    const backups = new Map<string, string>();
    for (const out of [registryOut, reviewOut]) {
      try {
        backups.set(out, readFileSync(out, "utf8"));
      } catch {
        backups.set(out, "");
      }
    }
    try {
      await expect(
        runProbeCommand(["US"], stubDeps(directResult()), seedsFile, undefined, recordOutput().output),
      ).resolves.toBe(0);
      expect(existsSync(registryOut)).toBe(true);
      expect(existsSync(reviewOut)).toBe(true);
    } finally {
      for (const [out, backup] of backups) {
        if (backup === "") {
          rmSync(out, { force: true });
        } else {
          writeFileSync(out, backup);
        }
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns 0 for --help without probing", async () => {
    const { dir, seedsFile } = writeSeeds();
    try {
      await expect(
        runProbeCommand(["--help"], stubDeps(directResult()), seedsFile, undefined, recordOutput().output),
      ).resolves.toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns 2 on usage errors", async () => {
    const { dir, seedsFile } = writeSeeds();
    const recorded = recordOutput();
    try {
      await expect(
        runProbeCommand(["--nope"], stubDeps(directResult()), seedsFile, undefined, recorded.output),
      ).resolves.toBe(2);
      expect(recorded.errors).toEqual(["Unknown argument: nope"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns 2 when the workflow throws a non-Error", async () => {
    const { dir, seedsFile } = writeSeeds();
    const recorded = recordOutput();
    try {
      await expect(
        runProbeCommand(["US", "--browser=direct"], stubDeps("plain failure"), seedsFile, undefined, recorded.output),
      ).resolves.toBe(2);
      expect(recorded.errors).toEqual(["plain failure"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("defaultDeps", () => {
  it("reads SOLARI_API_KEY from the environment", () => {
    const saved = process.env.SOLARI_API_KEY;
    try {
      process.env.SOLARI_API_KEY = "env-key";
      expect(defaultDeps().readApiKey()).toBe("env-key");
      delete process.env.SOLARI_API_KEY;
      expect(defaultDeps().readApiKey()).toBeUndefined();
    } finally {
      if (saved === undefined) {
        delete process.env.SOLARI_API_KEY;
      } else {
        process.env.SOLARI_API_KEY = saved;
      }
    }
  });

  it("builds a Solari provider session without network access", async () => {
    const provider = defaultDeps().createSolariProvider("test-key");
    expect(provider.name).toBe("solari");
    const session = await provider.launch({ stealth: true, proxyCountry: "mx", captcha: true });
    await (await session.newPage()).close();
    await session.close();
  });
});
