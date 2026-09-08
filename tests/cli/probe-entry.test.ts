import { afterEach, describe, expect, it, vi } from "vitest";
import { runProbeCommand } from "@tariff-radar/cli";
// The thin entry script has no package alias by design, so both its
// side-effect import and this mock stay on the relative path: the mock must
// target the exact module the entry imports, or the real command would run.
import "../../packages/cli/src/probe.js";

vi.mock("../../packages/cli/src/commands/probe.js", () => ({
  runProbeCommand: vi.fn(async () => 0),
}));

// Entry-point test: the static import above executes probe.ts with the
// dependency mocked, so the entry line runs hermetically with no network,
// no argv surgery, and no dynamic import.

const savedExit = process.exitCode;

afterEach(() => {
  process.exitCode = savedExit;
});

describe("probe entry", () => {
  it("forwards argv to runProbeCommand and sets the exit code", () => {
    expect(vi.mocked(runProbeCommand)).toHaveBeenCalledWith(process.argv.slice(2));
    expect(process.exitCode).toBe(0);
  });
});
