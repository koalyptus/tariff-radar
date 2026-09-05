import { runGenerateRegistry } from "./generate.js";

/**
 * Seed-only registry scaffold entry point. Intentionally thin — everything
 * testable lives in {@link runGenerateRegistry} — so unit coverage holds
 * without exclusions. Exercised by a dynamic-import entry test.
 */

await runGenerateRegistry(process.argv.slice(2));
