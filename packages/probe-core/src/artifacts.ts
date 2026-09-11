import { DEFAULT_DIRECT_PROBE_TIMEOUT_MS, DIRECT_PROBE_USER_AGENT } from "./direct-probe.js";

/** Upper bound on one artifact download: a memory bound, not a semantic one. */
export const MAX_ARTIFACT_BYTES = 25_000_000;

/**
 * Minimum extracted text characters to call a PDF text-based rather than
 * scanned. High enough that a scanned page's stray operators and metadata
 * fragments never qualify; low enough that sparse but real tariff tables do.
 */
export const PDF_TEXT_LAYER_MIN_CHARS = 200;

/** Document extensions worth harvesting from link scans. */
export const DOCUMENT_LINK_EXTENSIONS = ["pdf", "xls", "xlsx", "csv"] as const;

/** One candidate document link with its anchor label. */
export interface DocumentLink {
  /** Absolute URL of the linked document. */
  url: string;
  /** Anchor text, or the empty string when the anchor carries none. */
  label: string;
}

/** Raw bytes of one retrieved tariff document. */
export interface ArtifactDownload {
  /** File bytes, capped at {@link MAX_ARTIFACT_BYTES}. */
  buffer: Buffer;
  /** Observed `content-type` response header, or empty when unreported. */
  contentType: string;
  /** Byte length of `buffer`. */
  contentLength: number;
}

/** Outcome of one direct artifact download. Never throws. */
export interface ArtifactFetchResult {
  /** True only for a 2xx response carrying a non-HTML body within the byte cap. */
  ok: boolean;
  /** Observed HTTP status, or null on network/timeout failure. */
  status: number | null;
  /** Observed `content-type` header, or empty when unreported. */
  contentType: string;
  /** File bytes on success, empty otherwise. */
  data: Buffer;
  /** Failure reason (`HTTP <status>`, guard observation, or network error). */
  error: string | null;
}

/**
 * One retrieved document with its provenance. Carried on the workflow
 * result; the registry layer writes the bytes and manifest.
 */
export interface ArtifactRecord extends ArtifactDownload {
  /** Original document URL the bytes were retrieved from. */
  sourceUrl: string;
  /** Whether a PDF carries an extractable text layer; null for non-PDFs. */
  textLayer: boolean | null;
  /** Retrieving provider name, or null for the direct path. */
  provider: string | null;
  /** ISO timestamp of the retrieval. */
  retrievedAt: string;
}

/**
 * Download one document with native `fetch` under a bounded timeout.
 * Binary-safe: bytes are accumulated with a reader loop that aborts past
 * {@link MAX_ARTIFACT_BYTES}, and HTML bodies are refused (an HTML page
 * where a document was expected is a guard observation, not an artifact).
 * Never throws: non-2xx statuses, guard observations, over-cap bodies,
 * timeouts, and network errors fold into the returned result.
 * @param url - Absolute document URL to download.
 * @param timeoutMs - Abort threshold; defaults to
 * {@link DEFAULT_DIRECT_PROBE_TIMEOUT_MS}.
 * @returns The observed outcome, with bytes on success only.
 */
export async function fetchArtifact(url: string, timeoutMs?: number): Promise<ArtifactFetchResult> {
  const limit = timeoutMs ?? DEFAULT_DIRECT_PROBE_TIMEOUT_MS;
  const failure = (status: number | null, contentType: string | null, error: string): ArtifactFetchResult => ({
    ok: false,
    status,
    contentType: contentType ?? "",
    data: Buffer.alloc(0),
    error,
  });
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(limit),
      headers: { "User-Agent": DIRECT_PROBE_USER_AGENT },
    });
    const contentType = response.headers?.get("content-type") ?? "";
    if (!response.ok) {
      return failure(response.status, contentType, `HTTP ${String(response.status)}`);
    }
    if (isHtmlContent(contentType)) {
      return failure(response.status, contentType, `unexpected content-type ${contentType}`);
    }
    const data = await readCappedBytes(response);
    if (data === null) {
      return failure(response.status, contentType, `body exceeds ${String(MAX_ARTIFACT_BYTES)} bytes`);
    }
    return { ok: true, status: response.status, contentType, data, error: null };
  } catch (error) {
    return failure(null, null, error instanceof Error ? error.message : String(error));
  }
}

/**
 * Read a response body up to {@link MAX_ARTIFACT_BYTES} plus one byte.
 * The reader is cancelled past the cap so a lying `content-length` cannot
 * grow memory without bound. Never throws: a body-read failure yields null.
 * @param response - Successful fetch response.
 * @returns The bytes, or null when over cap or unreadable.
 */
async function readCappedBytes(response: Response): Promise<Buffer | null> {
  if (response.body === null) {
    return Buffer.alloc(0);
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      total += value.byteLength;
      if (total > MAX_ARTIFACT_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

/**
 * Decide whether a body is a guard/landing page rather than a document.
 * HTML where a binary was expected means a WAF, login wall, or redirect
 * to a landing page — never an artifact.
 * @param contentType - Raw `content-type` header value, possibly empty.
 * @returns True for HTML bodies; an empty content-type counts as unknown,
 *   not as HTML, so extension-less binaries still download.
 */
export function isHtmlContent(contentType: string): boolean {
  return /html/i.test(contentType);
}

/**
 * Decide whether a body is a PDF document.
 * @param contentType - Raw `content-type` header value, possibly empty.
 * @returns True for PDF bodies, used for text-layer detection.
 */
export function isPdfContent(contentType: string): boolean {
  return /pdf/i.test(contentType);
}

/**
 * Harvest candidate document links from raw HTML. Covers the direct path,
 * which never renders JavaScript; JS-driven download triggers need the
 * browser page's `extractDocumentLinks` instead. Pure and never throwing:
 * unresolvable hrefs are skipped, not reported.
 * @param html - Raw page markup from the direct probe.
 * @param baseUrl - URL the markup was fetched from, for relative hrefs.
 * @returns Absolute document links in document order, deduplicated by URL.
 */
export function extractDocumentLinksFromHtml(html: string, baseUrl: string): DocumentLink[] {
  const links: DocumentLink[] = [];
  const seen = new Set<string>();
  const pattern = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a\s*>/gi;
  for (;;) {
    const match = pattern.exec(html);
    if (match === null) {
      break;
    }
    // Exactly one of the three quote alternatives participates per match.
    const href = match[1] ?? match[2] ?? match[3];
    if (!hasDocumentExtension(href)) {
      continue;
    }
    const url = resolveUrl(href, baseUrl);
    if (url === null || seen.has(url)) {
      continue;
    }
    seen.add(url);
    links.push({ url, label: stripTags(match[4]).trim() });
  }
  return links;
}

/**
 * Decide whether an href points at a downloadable tariff document by
 * extension, ignoring query strings and fragments.
 * @param href - Raw href value from the anchor.
 * @returns True for the {@link DOCUMENT_LINK_EXTENSIONS} extensions.
 */
function hasDocumentExtension(href: string): boolean {
  const path = href.split(/[?#]/, 1)[0];
  const parts = path.split(".");
  const extension = parts[parts.length - 1].toLowerCase();
  return (DOCUMENT_LINK_EXTENSIONS as readonly string[]).includes(extension);
}

/**
 * Resolve an href against the page URL. Never throws: garbage hrefs yield
 * null so one bad anchor cannot fail the whole harvest.
 * @param href - Raw href value from the anchor.
 * @param baseUrl - Page URL for relative resolution.
 * @returns The absolute URL, or null when unresolvable.
 */
function resolveUrl(href: string, baseUrl: string): string | null {
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return null;
  }
}

/**
 * Strip nested markup from anchor content for the link label.
 * @param markup - Inner HTML of the anchor.
 * @returns Text content with tags removed.
 */
function stripTags(markup: string): string {
  return markup.replace(/<[^>]*>/g, "");
}

/**
 * Check a PDF buffer for an extractable text layer (text-showing
 * operators with enough surrounding text). Text-layer check only: no
 * rendering, no OCR, no image processing. Non-PDF buffers return false;
 * callers record null for those.
 * @param buffer - Raw file bytes.
 * @returns True when a text layer with at least
 * {@link PDF_TEXT_LAYER_MIN_CHARS} text characters is observed.
 */
export function hasPdfTextLayer(buffer: Buffer): boolean {
  if (!buffer.subarray(0, 5).toString("latin1").startsWith("%PDF-")) {
    return false;
  }
  const text = buffer.toString("latin1");
  if (!/[Tt][Jj]/.test(text)) {
    return false;
  }
  const candidates = text.match(/\((?:\\.|[^()\\])*\)/g) ?? [];
  let total = 0;
  for (const candidate of candidates) {
    total += candidate.length - 2;
    if (total >= PDF_TEXT_LAYER_MIN_CHARS) {
      return true;
    }
  }
  return false;
}
