import { Solari } from "@solarisdk/browser";
import type { BrowserSession } from "@solarisdk/browser";
import type {
  ArtifactDownload,
  BrowserProbeOptions,
  BrowserProbePage,
  BrowserProbeProvider,
  BrowserProbeResponse,
  BrowserProbeSession,
  DocumentLink,
} from "@tariff-radar/probe-core";
import { DOCUMENT_LINK_EXTENSIONS, MAX_ARTIFACT_BYTES } from "@tariff-radar/probe-core";

/**
 * Credentials for the Solari adapter. Supplied by the CLI/composition root;
 * this package never reads environment variables or knows key names.
 */
export interface SolariProviderOptions {
  /** Solari API key, passed through to the SDK client. */
  apiKey: string;
}

type SolariBrowser = BrowserSession;
type SolariPage = Awaited<ReturnType<SolariBrowser["newPage"]>>;

const PROVIDER_NAME = "solari";

/**
 * {@link BrowserProbeProvider} backed by the Solari SDK. The only module
 * allowed to import `@solarisdk/browser`; everything else depends on the
 * provider-neutral contract.
 *
 * The provider itself is stateless: every `launch()` opens a fresh SDK client
 * alongside the browser, and session close releases both. Sharing one client
 * across sessions breaks the second launch, because closing the first session
 * shuts the client's loopback proxy down (`LocalProxy not started`).
 */
export class SolariBrowserProvider implements BrowserProbeProvider {
  readonly name = PROVIDER_NAME;
  private readonly apiKey: string;

  /**
   * Build the adapter. Holds credentials only; no browser resources yet.
   * @param options - SDK credentials from the composition root.
   */
  constructor(options: SolariProviderOptions) {
    this.apiKey = options.apiKey;
  }

  /**
   * Open a Solari browser session, translating provider-neutral options into
   * SDK options. Session close always releases its browser and its own
   * client, so the loopback proxy never outlives the run.
   * @param options - Opt-in capabilities (stealth, CAPTCHA, proxy country).
   * @returns A session the caller must close.
   */
  async launch(options: BrowserProbeOptions = {}): Promise<BrowserProbeSession> {
    const client = new Solari({ apiKey: this.apiKey });
    let browser: SolariBrowser;
    try {
      browser = await client.launch({
        stealth: options.stealth,
        captcha: options.captcha,
        proxy: options.proxyCountry,
      });
    } catch (error) {
      // Never leak a client whose browser failed to start: its loopback
      // proxy would otherwise outlive the run (and the cloud session with
      // it — see the orphaned instances from shared-client reuse).
      await client.close();
      throw error;
    }

    return {
      sessionId: browser.id,
      newPage: async () => createPageAdapter(await browser.newPage()),
      close: async () => {
        // The client holds a loopback proxy open: always release it, even
        // when the browser itself fails to close, or the process hangs.
        try {
          await browser.close();
        } finally {
          await client.close();
        }
      },
    };
  }
}

function createPageAdapter(page: SolariPage): BrowserProbePage {
  return {
    goto: async (url: string): Promise<BrowserProbeResponse | null> => {
      const response = await page.goto(url);
      return response
        ? {
            status: () => response.status(),
            url: () => response.url(),
          }
        : null;
    },
    title: () => page.title(),
    text: () => page.locator("body").innerText(),
    extractDocumentLinks: () => harvestRenderedLinks(page),
    downloadArtifact: (targetUrl: string) => streamSessionArtifact(page, targetUrl),
    close: () => page.close(),
  };
}

/**
 * Harvest candidate document links from the rendered DOM: the only path
 * that sees JS-driven download triggers invisible to raw-HTML scans.
 * Relative hrefs resolve against the rendered page URL.
 * @param page - Solari (Playwright) page after portal navigation.
 * @returns Absolute document links with anchor labels, deduplicated by URL.
 */
async function harvestRenderedLinks(page: SolariPage): Promise<DocumentLink[]> {
  const anchors = await page.evaluate(() =>
    Array.from(document.querySelectorAll("a[href]")).map((anchor) => ({
      href: anchor.getAttribute("href") ?? "",
      label: anchor.textContent?.trim() ?? "",
    })),
  );
  const seen = new Set<string>();
  const links: DocumentLink[] = [];
  for (const anchor of anchors) {
    if (!hasDocumentExtension(anchor.href)) {
      continue;
    }
    const url = resolveUrl(anchor.href, page.url());
    if (url === null || seen.has(url)) {
      continue;
    }
    seen.add(url);
    links.push({ url, label: anchor.label });
  }
  return links;
}

/**
 * Stream one document through the page's session: cookies established
 * during navigation and the session's stealth/proxy egress are inherited,
 * so WAF-guarded and geo-fenced endpoints answer with bytes instead of
 * challenges. HTML bodies are refused — a challenge page where a document
 * was expected is not an artifact.
 * @param page - Solari (Playwright) page after portal navigation.
 * @param targetUrl - Absolute document URL to stream.
 * @returns The raw bytes with the observed content type.
 * @throws When the endpoint answers non-2xx, HTML, or over-cap bytes.
 */
async function streamSessionArtifact(page: SolariPage, targetUrl: string): Promise<ArtifactDownload> {
  const response = await page.request.get(targetUrl);
  const contentType = response.headers()["content-type"] ?? "";
  if (!response.ok()) {
    throw new Error(`HTTP ${String(response.status())}`);
  }
  if (/html/i.test(contentType)) {
    throw new Error(`unexpected content-type ${contentType}`);
  }
  const buffer = await response.body();
  if (buffer.byteLength > MAX_ARTIFACT_BYTES) {
    throw new Error(`body exceeds ${String(MAX_ARTIFACT_BYTES)} bytes`);
  }
  return { buffer, contentType, contentLength: buffer.byteLength };
}

/**
 * Decide whether an href points at a downloadable tariff document by
 * extension, ignoring query strings and fragments.
 * @param href - Raw href value from the anchor.
 * @returns True for the shared document extensions.
 */
function hasDocumentExtension(href: string): boolean {
  const path = href.split(/[?#]/, 1)[0];
  const parts = path.split(".");
  const extension = parts[parts.length - 1].toLowerCase();
  return (DOCUMENT_LINK_EXTENSIONS as readonly string[]).includes(extension);
}

/**
 * Resolve an href against the rendered page URL. Never throws: garbage
 * hrefs yield null so one bad anchor cannot fail the whole harvest.
 * @param href - Raw href value from the anchor.
 * @param baseUrl - Rendered page URL for relative resolution.
 * @returns The absolute URL, or null when unresolvable.
 */
function resolveUrl(href: string, baseUrl: string): string | null {
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return null;
  }
}
