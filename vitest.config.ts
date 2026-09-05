import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("./", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Run tests against package sources so `pnpm test` needs no prior build.
      "@tariff-radar/probe-core": `${root}packages/probe-core/src/index.ts`,
      "@tariff-radar/workflow": `${root}packages/workflow/src/index.ts`,
      "@tariff-radar/shared": `${root}packages/shared/src/index.ts`,
      "@tariff-radar/cli": `${root}packages/cli/src/index.ts`,
      "@tariff-radar/registry": `${root}packages/registry/src/index.ts`,
      "@tariff-radar/provider-solari": `${root}packages/providers/solari/src/index.ts`,
      // Never load the real browser SDK in tests (it performs network I/O);
      // the provider adapter is exercised against tests/fakes/solari-browser.ts.
      "@solarisdk/browser": `${root}tests/fakes/solari-browser.ts`,
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // Every package source is measured, including thin entry scripts:
      // entries delegate to tested mains, so no exclusions are needed.
      include: ["packages/**/src/**/*.ts"],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
