import { Solari } from "@solarisdk/browser";
import type {
  BrowserProbeOptions,
  BrowserProbePage,
  BrowserProbeProvider,
  BrowserProbeResponse,
  BrowserProbeSession,
} from "@tariff-radar/probe-core";

/**
 * Credentials for the Solari adapter. Supplied by the CLI/composition root;
 * this package never reads environment variables or knows key names.
 */
export interface SolariProviderOptions {
  /** Solari API key, passed through to the SDK client. */
  apiKey: string;
}

type SolariBrowser = Awaited<ReturnType<Solari["launch"]>>;
type SolariPage = Awaited<ReturnType<SolariBrowser["newPage"]>>;

const PROVIDER_NAME = "solari";

/**
 * {@link BrowserProbeProvider} backed by the Solari SDK. The only module
 * allowed to import `@solarisdk/browser`; everything else depends on the
 * provider-neutral contract.
 */
export class SolariBrowserProvider implements BrowserProbeProvider {
  readonly name = PROVIDER_NAME;
  private readonly client: Solari;

  /**
   * Build the adapter. Holds no browser resources yet; those open per launch.
   * @param options - SDK credentials from the composition root.
   */
  constructor(options: SolariProviderOptions) {
    this.client = new Solari({ apiKey: options.apiKey });
  }

  /**
   * Open a Solari browser session, translating provider-neutral options into
   * SDK options. Session close always releases the client too, so the
   * loopback proxy never outlives the run.
   * @param options - Opt-in capabilities (stealth, CAPTCHA, proxy country).
   * @returns A session the caller must close.
   */
  async launch(options: BrowserProbeOptions = {}): Promise<BrowserProbeSession> {
    const browser = await this.client.launch({
      stealth: options.stealth,
      captcha: options.captcha,
      proxy: options.proxyCountry,
    });

    return {
      newPage: async () => createPageAdapter(await browser.newPage()),
      close: async () => {
        // The client holds a loopback proxy open: always release it, even
        // when the browser itself fails to close, or the process hangs.
        try {
          await browser.close();
        } finally {
          await this.client.close();
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
    close: () => page.close(),
  };
}
