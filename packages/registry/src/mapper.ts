import type { WorkflowResult } from "@tariff-radar/probe-core";
import type { RegistryEntry, RegistryVerification } from "./types.js";

export const REGISTRY_VERIFICATION_STATUS = "unverified" as const;

/**
 * Map completed workflow results to registry entries. Pure: every field is
 * derived from the observed result and a single timestamp. Failed runs are
 * represented (method `failed`, error recorded) without ever claiming
 * verification.
 * @param results - Completed workflow results in run order.
 * @param checkedAt - ISO timestamp shared by every entry in this batch.
 * @returns One registry entry per result, preserving seed provenance.
 */
export function mapWorkflowResultsToEntries(results: readonly WorkflowResult[], checkedAt: string): RegistryEntry[] {
  return results.map((result) => ({
    ...result.seed,
    verification: buildVerification(result, checkedAt),
  }));
}

function buildVerification(result: WorkflowResult, checkedAt: string): RegistryVerification {
  return {
    status: REGISTRY_VERIFICATION_STATUS,
    checkedAt,
    method: result.method,
    provider: result.provider,
    directStatus: result.direct.status,
    directLatencyMs: result.direct.latencyMs,
    directAttempts: result.direct.attempts,
    directError: result.direct.error,
    browserStatus: result.browser?.status ?? null,
    browserFinalUrl: result.browser?.finalUrl ?? null,
    browserTitle: result.browser?.title ?? null,
    browserLatencyMs: result.browser?.latencyMs ?? null,
    evidence: result.evidence,
    error: result.error,
  };
}
