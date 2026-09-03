import { Solari } from "@solarisdk/browser"
import type {
  BrowserProbeOptions,
  BrowserProbePage,
  BrowserProbeProvider,
  BrowserProbeResponse,
  BrowserProbeSession,
} from "@tariff-radar/probe-core"

export interface SolariProviderOptions {
  apiKey: string
}

type SolariBrowser = Awaited<ReturnType<Solari["launch"]>>
type SolariPage = Awaited<ReturnType<SolariBrowser["newPage"]>>

export class SolariBrowserProvider implements BrowserProbeProvider {
  readonly name = "solari"
  private readonly client: Solari

  constructor(options: SolariProviderOptions) {
    this.client = new Solari({ apiKey: options.apiKey })
  }

  async launch(options: BrowserProbeOptions = {}): Promise<BrowserProbeSession> {
    const browser = await this.client.launch({
      stealth: options.stealth,
      captcha: options.captcha,
      proxy: options.proxyCountry,
    })

    return {
      newPage: async () => createPageAdapter(await browser.newPage()),
      close: async () => {
        await browser.close()
        await this.client.close()
      },
    }
  }
}

function createPageAdapter(page: SolariPage): BrowserProbePage {
  return {
    goto: async (url: string): Promise<BrowserProbeResponse | null> => {
      const response = await page.goto(url)
      return response
        ? {
            status: () => response.status(),
            url: () => response.url(),
          }
        : null
    },
    title: () => page.title(),
    text: () => page.locator("body").innerText(),
    close: () => page.close(),
  }
}
