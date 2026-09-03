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

export interface DirectProbeResult {
  ok: boolean
  status: number | null
  finalUrl: string | null
  latencyMs: number
  title: string | null
  error: string | null
}

export const PROBE_METHOD = {
  DIRECT: "direct",
  BROWSER: "browser",
  FAILED: "failed",
} as const

export const PROBE_EVIDENCE = {
  DIRECT_RESPONSE: "direct_response",
  BROWSER_RESPONSE: "browser_response",
  BROWSER_TEXT: "browser_text",
} as const

export type ProbeMethod = (typeof PROBE_METHOD)[keyof typeof PROBE_METHOD]

export interface WorkflowResult {
  seed: {
    isoCode: string
    countryName: string
    portalUrl: string
    sourceUrl: string
  }
  method: ProbeMethod
  provider: string | null
  direct: DirectProbeResult
  browser: {
    status: number | null
    finalUrl: string | null
    title: string | null
    text: string | null
  } | null
  evidence: string[]
  error: string | null
}

export { runDirectProbe } from "./direct-probe.js"
