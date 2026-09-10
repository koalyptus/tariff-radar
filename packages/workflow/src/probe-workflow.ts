import {
  PROBE_EVIDENCE,
  PROBE_METHOD,
  ProbeRunLogger,
  assessContentRelevance,
  extractDocumentLinksFromHtml,
  fetchArtifact,
  hasPdfTextLayer,
  noopProbeLogger,
  runDirectProbe,
} from "@tariff-radar/probe-core";
import type {
  ArtifactRecord,
  BrowserProbeOptions,
  BrowserProbePage,
  BrowserProbeProvider,
  DocumentLink,
  ProbeLogger,
  WorkflowResult,
} from "@tariff-radar/probe-core";

const DIRECT_PROBE_FAILURE = "direct probe failed and no browser provider was configured";

/** Upper bound on documents retrieved per seed: a cost and memory bound. */
export const MAX_ARTIFACTS_PER_SEED = 5;

/** One manually selected portal hypothesis fed into the probe workflow. */
export interface WorkflowSeed {
  isoCode: string;
  countryName: string;
  authority: string;
  portalUrl: string;
  sourceUrl: string;
}

/**
 * Knobs for one workflow run. Everything is optional: without a browser
 * provider the run is direct-only and reports failure when direct fails.
 */
export interface ProbeWorkflowOptions {
  /** Browser provider for fallback after direct failure. */
  browserProvider?: BrowserProbeProvider;
  /** Opt-in browser capabilities forwarded to the provider. */
  browserOptions?: BrowserProbeOptions;
  /** Direct-probe timeout override. */
  timeoutMs?: number;
  /** Structured logger; defaults to silent. Never receives page contents. */
  logger?: ProbeLogger;
}

/**
 * Probe one seed direct-first, escalating to the browser provider only after
 * direct failure. After a successful portal observation, candidate document
 * links are harvested (direct HTML scan, browser DOM) and each document is
 * downloaded direct-first, falling back to the browser page's session-bound
 * streaming only when direct fails. Page and session are always closed, on
 * success and on failure. Logs start, direct completion, browser fallback,
 * browser completion, and failure events with safe structured context.
 * @param seed - Candidate portal hypothesis with provenance URLs.
 * @param options - Browser provider, timeouts, and logger overrides.
 * @returns The workflow result; failures carry the error, never guesses.
 */
export async function probeWorkflow(seed: WorkflowSeed, options: ProbeWorkflowOptions = {}): Promise<WorkflowResult> {
  const log = new ProbeRunLogger(options.logger ?? noopProbeLogger, seed);
  log.start();

  const direct = await runDirectProbe(seed.portalUrl, options.timeoutMs);
  log.directComplete(direct);

  if (direct.ok) {
    const relevance = assessContentRelevance({ title: null, text: direct.text });
    const links =
      direct.text === null ? [] : extractDocumentLinksFromHtml(direct.text, direct.finalUrl ?? seed.portalUrl);
    const artifacts = await retrieveArtifacts(links, null, null, options.timeoutMs);
    return {
      seed,
      method: PROBE_METHOD.DIRECT,
      provider: null,
      direct,
      browser: null,
      // Transport success plus whatever the body scan observed: a keyword
      // hit is content evidence, but the record stays unverified either way.
      evidence: [PROBE_EVIDENCE.DIRECT_RESPONSE, ...relevance.evidence, ...artifactEvidence(links, artifacts)],
      artifacts,
      error: null,
    };
  }

  if (!options.browserProvider) {
    log.failed(null, DIRECT_PROBE_FAILURE);
    return {
      seed,
      method: PROBE_METHOD.FAILED,
      provider: null,
      direct,
      browser: null,
      evidence: [],
      artifacts: [],
      error: DIRECT_PROBE_FAILURE,
    };
  }

  log.browserFallback(options.browserProvider.name, options.browserOptions);
  const browserStartedAt = performance.now();

  try {
    const session = await options.browserProvider.launch(options.browserOptions);
    try {
      const page = await session.newPage();
      try {
        const response = await page.goto(seed.portalUrl);
        const text = await page.text();
        const title = await page.title();
        const status = response?.status() ?? null;
        const finalUrl = response?.url() ?? null;
        const latencyMs = Math.round(performance.now() - browserStartedAt);
        log.browserComplete(options.browserProvider.name, status, finalUrl, latencyMs);
        const relevance = assessContentRelevance({ title, text });
        const links = await harvestBrowserLinks(page);
        const artifacts = await retrieveArtifacts(links, page, options.browserProvider.name, options.timeoutMs);
        const sessionId = session.sessionId ?? null;
        return {
          seed,
          method: PROBE_METHOD.BROWSER,
          provider: options.browserProvider.name,
          direct,
          browser: {
            status,
            finalUrl,
            title,
            text,
            sessionId,
            latencyMs,
          },
          // Claim only what was observed: a null response yields no
          // browser_response evidence, even though the page rendered.
          // Keyword evidence comes from the pure content-relevance check;
          // transport success alone never implies relevance.
          evidence: [
            ...(status !== null ? [PROBE_EVIDENCE.BROWSER_RESPONSE] : []),
            PROBE_EVIDENCE.BROWSER_TEXT,
            ...relevance.evidence,
            ...artifactEvidence(links, artifacts),
          ],
          artifacts,
          error: null,
        };
      } finally {
        await page.close();
      }
    } finally {
      await session.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.failed(options.browserProvider.name, message);
    return {
      seed,
      method: PROBE_METHOD.FAILED,
      provider: options.browserProvider.name,
      direct,
      browser: null,
      evidence: [],
      artifacts: [],
      error: message,
    };
  }
}

/**
 * Harvest document links from the rendered DOM. Providers without DOM
 * evaluation simply contribute none; the workflow never requires it.
 * @param page - Browser tab for the portal navigation.
 * @returns Deduplicated document links, or empty when unsupported.
 */
async function harvestBrowserLinks(page: BrowserProbePage): Promise<DocumentLink[]> {
  if (page.extractDocumentLinks === undefined) {
    return [];
  }
  const seen = new Set<string>();
  const links: DocumentLink[] = [];
  for (const link of await page.extractDocumentLinks()) {
    if (!seen.has(link.url)) {
      seen.add(link.url);
      links.push(link);
    }
  }
  return links;
}

/**
 * Retrieve up to {@link MAX_ARTIFACTS_PER_SEED} documents, each direct-first
 * with browser fallback. A link whose direct download fails falls back to
 * the page's session-bound streaming only when the page supports it;
 * otherwise the link stays observed-but-unretrieved. Download failures
 * never throw and never revoke the portal observation.
 * @param links - Candidate document links in discovery order.
 * @param page - Browser tab for fallback, or null on the direct path.
 * @param provider - Provider name for browser retrievals, or null direct.
 * @param timeoutMs - Direct-download timeout override.
 * @returns Retrieved documents with provenance, in link order.
 */
async function retrieveArtifacts(
  links: DocumentLink[],
  page: BrowserProbePage | null,
  provider: string | null,
  timeoutMs?: number,
): Promise<ArtifactRecord[]> {
  const artifacts: ArtifactRecord[] = [];
  for (const link of links.slice(0, MAX_ARTIFACTS_PER_SEED)) {
    const record = await retrieveArtifact(link, page, provider, timeoutMs);
    if (record !== null) {
      artifacts.push(record);
    }
  }
  return artifacts;
}

/**
 * Retrieve one document direct-first, then via the browser page.
 * @param link - Candidate document link.
 * @param page - Browser tab for fallback, or null on the direct path.
 * @param provider - Provider name for browser retrievals, or null direct.
 * @param timeoutMs - Direct-download timeout override.
 * @returns The artifact record, or null when neither path produced bytes.
 */
async function retrieveArtifact(
  link: DocumentLink,
  page: BrowserProbePage | null,
  provider: string | null,
  timeoutMs?: number,
): Promise<ArtifactRecord | null> {
  const retrievedAt = new Date().toISOString();
  const fetched = await fetchArtifact(link.url, timeoutMs);
  if (fetched.ok) {
    return toRecord(link.url, fetched.data, fetched.contentType, null, retrievedAt);
  }
  if (page?.downloadArtifact === undefined) {
    return null;
  }
  try {
    const downloaded = await page.downloadArtifact(link.url);
    return toRecord(link.url, downloaded.buffer, downloaded.contentType, provider, retrievedAt);
  } catch {
    return null;
  }
}

/**
 * Assemble an artifact record with PDF text-layer detection.
 * @param sourceUrl - Original document URL the bytes came from.
 * @param buffer - Retrieved file bytes.
 * @param contentType - Observed content type.
 * @param provider - Retrieving provider, or null for the direct path.
 * @param retrievedAt - ISO timestamp of the retrieval.
 * @returns The provenance-carrying record.
 */
function toRecord(
  sourceUrl: string,
  buffer: Buffer,
  contentType: string,
  provider: string | null,
  retrievedAt: string,
): ArtifactRecord {
  return {
    sourceUrl,
    buffer,
    contentType,
    contentLength: buffer.byteLength,
    textLayer: /pdf/i.test(contentType) ? hasPdfTextLayer(buffer) : null,
    provider,
    retrievedAt,
  };
}

/**
 * Evidence keys for the document phase: observed links, stored artifacts,
 * and whether the browser path was required for any of them.
 * @param links - Candidate document links discovered on this run.
 * @param artifacts - Documents actually retrieved on this run.
 * @returns Evidence keys in stable order.
 */
function artifactEvidence(links: DocumentLink[], artifacts: ArtifactRecord[]): string[] {
  return [
    ...(links.length > 0 ? [PROBE_EVIDENCE.DOCUMENT_LINK] : []),
    ...(artifacts.length > 0 ? [PROBE_EVIDENCE.ARTIFACT_STORED] : []),
    ...(artifacts.some((artifact) => artifact.provider !== null) ? [PROBE_EVIDENCE.ARTIFACT_BROWSER] : []),
  ];
}
