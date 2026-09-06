import { afterEach, describe, expect, it } from "vitest";
import { runProbeCommand } from "@tariff-radar/cli";

const savedArgv = process.argv;
const savedExit = process.exitCode;

afterEach(() => {
  process.argv = process.argv;
  process.exitCode = 0;
});

describe("probe entry on usage error", () => {
  it("sets exit 2", async () => {
    process.argv = ["node", "probe.js", "--nope"];
    process.exitCode = await runProbeCommand(["--nope"]);
    expect(process.exitCode).toBe(2);
  });
});
