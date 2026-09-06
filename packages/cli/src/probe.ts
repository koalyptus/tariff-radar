import { runCli } from "./run-cli.js";

/**
 * Single-seed / all-seed probe entry point. Intentionally thin — everything
 * testable lives in {@link runCli} — so unit coverage holds without
 * exclusions. Exercised by a mocked-dependency entry test.
 */

process.exitCode = await runCli(process.argv.slice(2));
