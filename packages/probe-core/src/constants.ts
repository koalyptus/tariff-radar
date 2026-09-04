/**
 * Outcome vocabulary for a workflow run. Lives here (rather than
 * `index.ts`) so value-level consumers like the log emitter can import it
 * without a module cycle. Use these constants, never string literals, so
 * result handling stays exhaustive.
 */
export const PROBE_METHOD = {
  DIRECT: "direct",
  BROWSER: "browser",
  FAILED: "failed",
} as const;

/**
 * Evidence vocabulary for a workflow run. Entries claim only what was
 * observed: a missing response yields no `*_RESPONSE` entry.
 */
export const PROBE_EVIDENCE = {
  DIRECT_RESPONSE: "direct_response",
  BROWSER_RESPONSE: "browser_response",
  BROWSER_TEXT: "browser_text",
} as const;

/** One of the {@link PROBE_METHOD} outcome values. */
export type ProbeMethod = (typeof PROBE_METHOD)[keyof typeof PROBE_METHOD];
