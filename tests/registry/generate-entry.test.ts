import { describe, expect, it, vi } from "vitest";
import { runGenerateRegistry } from "../../packages/registry/src/generate.js";
import "../../packages/registry/src/generate-registry.js";

vi.mock("../../packages/registry/src/generate.js", () => ({
  runGenerateRegistry: vi.fn(async () => 1),
}));

// Entry-point test: the static import above executes generate-registry.ts
// with the dependency mocked, so the entry line runs hermetically with no
// filesystem writes, no argv surgery, and no dynamic import.

describe("generate-registry entry", () => {
  it("forwards argv to runGenerateRegistry", () => {
    expect(vi.mocked(runGenerateRegistry)).toHaveBeenCalledWith(process.argv.slice(2));
  });
});
