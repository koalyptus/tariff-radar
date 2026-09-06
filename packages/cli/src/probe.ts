import { runProbeCommand } from "./commands/probe.js";

/**
 * Single-seed / all-seed probe entry point. Intentionally thin — everything
 * testable lives in {@link runProbeCommand} — so unit coverage holds without
 * exclusions. Exercised by a mocked-dependency entry test.
 */

process.exitCode = await runProbeCommand(process.argv.slice(2));
