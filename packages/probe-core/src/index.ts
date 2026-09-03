export interface BrowserProbeOptions {
  proxyCountry?: string
  stealth?: boolean
  captcha?: boolean
}

export interface BrowserProbePage {
  goto(url: string): Promise<BrowserProbeResponse | null>
  title(): Promise<string>
  text(): Promise<string>
  close(): Promise<void>
}

export interface BrowserProbeResponse {
  status(): number | null
  url(): string
}

export interface BrowserProbeSession {
  newPage(): Promise<BrowserProbePage>
  close(): Promise<void>
}

export interface BrowserProbeProvider {
  readonly name: string
  launch(options?: BrowserProbeOptions): Promise<BrowserProbeSession>
}
