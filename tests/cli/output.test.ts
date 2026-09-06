import { afterEach, describe, expect, it, vi } from "vitest";
import { stdioOutput } from "@tariff-radar/cli";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("stdioOutput", () => {
  it("writes tables to stdout and lines to stderr", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const output = stdioOutput();
    output.printTable("table");
    output.printProgress("progress");
    output.printError("failure");
    expect(log).toHaveBeenCalledWith("table");
    expect(write).toHaveBeenCalledWith("progress\n");
    expect(error).toHaveBeenCalledWith("failure");
  });
});
