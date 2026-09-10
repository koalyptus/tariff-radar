import { afterEach, describe, expect, it, vi } from "vitest";
import { PROBE_EVIDENCE, PROBE_METHOD } from "@tariff-radar/probe-core";
import type { BrowserProbeProvider } from "@tariff-radar/probe-core";
import { MAX_ARTIFACTS_PER_SEED, probeWorkflow } from "@tariff-radar/workflow";
import type { WorkflowSeed } from "@tariff-radar/workflow";

const seed: WorkflowSeed = {
  isoCode: "T1",
  countryName: "Testland",
  portalUrl: "https://portal.example/tariff",
  sourceUrl: "https://authority.example/",
};

function fetchOk(body = "") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      url: "https://portal.example/tariff",
      headers: { get: () => "text/html" },
      text: async () => body,
    })),
  );
}

function fetchFail() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("connection refused");
    }),
  );
}

function fetchPortalDocs(portalBody: string, docStatus: number, docContentType: string, docBytes: Uint8Array) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.startsWith("https://cdn.example/")) {
        return new Response(docStatus === 200 ? Buffer.from(docBytes) : "denied", {
          status: docStatus,
          headers: { "content-type": docContentType },
        });
      }
      return {
        ok: true,
        status: 200,
        url: "https://portal.example/tariff",
        headers: { get: () => "text/html" },
        text: async () => portalBody,
      };
    }),
  );
}

function fetchFailPortalDocs(docStatus: number) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.startsWith("https://cdn.example/")) {
        return new Response("denied", { status: docStatus, headers: { "content-type": "text/html" } });
      }
      throw new Error("connection refused");
    }),
  );
}

function fakeProvider(hooks: {
  response: { status: number; url: string } | null;
  launchError?: unknown;
  gotoError?: unknown;
  title?: string;
  text?: string;
  sessionId?: string;
  docLinks?: Array<{ url: string; label: string }>;
  download?: { buffer: Buffer; contentType: string };
  downloadError?: unknown;
  onPageClose?: () => void;
  onSessionClose?: () => void;
}): BrowserProbeProvider {
  return {
    name: "fake",
    launch: async () => {
      if (hooks.launchError !== undefined) {
        throw hooks.launchError;
      }
      return {
        sessionId: hooks.sessionId,
        newPage: async () => ({
          goto: async () => {
            if (hooks.gotoError !== undefined) {
              throw hooks.gotoError;
            }
            const response = hooks.response;
            return response ? { status: () => response.status, url: () => response.url } : null;
          },
          title: async () => hooks.title ?? "Tariff portal",
          text: async () => hooks.text ?? "customs duty tariff",
          ...(hooks.docLinks !== undefined
            ? {
                extractDocumentLinks: async () => hooks.docLinks,
              }
            : {}),
          ...(hooks.download !== undefined || hooks.downloadError !== undefined
            ? {
                downloadArtifact: async () => {
                  if (hooks.downloadError !== undefined) {
                    throw hooks.downloadError;
                  }
                  const download = hooks.download ?? { buffer: Buffer.alloc(0), contentType: "" };
                  return { ...download, contentLength: download.buffer.byteLength };
                },
              }
            : {}),
          close: async () => {
            hooks.onPageClose?.();
          },
        }),
        close: async () => {
          hooks.onSessionClose?.();
        },
      };
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("probeWorkflow", () => {
  it("returns the direct result when the direct probe succeeds", async () => {
    fetchOk();
    const result = await probeWorkflow(seed);
    expect(result.method).toBe(PROBE_METHOD.DIRECT);
    expect(result.provider).toBeNull();
    expect(result.browser).toBeNull();
    expect(result.direct.ok).toBe(true);
    expect(result.evidence).toEqual([PROBE_EVIDENCE.DIRECT_RESPONSE]);
    expect(result.error).toBeNull();
  });

  it("attaches keyword evidence to direct results with tariff terminology", async () => {
    fetchOk("<html><body>customs tariff schedule</body></html>");
    const result = await probeWorkflow(seed);
    expect(result.method).toBe(PROBE_METHOD.DIRECT);
    expect(result.provider).toBeNull();
    expect(result.browser).toBeNull();
    expect(result.evidence).toEqual([
      PROBE_EVIDENCE.DIRECT_RESPONSE,
      PROBE_EVIDENCE.TARIFF_KEYWORD,
      PROBE_EVIDENCE.CUSTOMS_KEYWORD,
    ]);
    expect(result.error).toBeNull();
  });

  it("fails without a browser provider after direct failure", async () => {
    fetchFail();
    const result = await probeWorkflow(seed);
    expect(result.method).toBe(PROBE_METHOD.FAILED);
    expect(result.provider).toBeNull();
    expect(result.browser).toBeNull();
    expect(result.evidence).toEqual([]);
    expect(result.error).toContain("no browser provider");
  });

  it("falls back to the browser and closes page and session", async () => {
    fetchFail();
    let pageClosed = false;
    let sessionClosed = false;
    const result = await probeWorkflow(seed, {
      browserProvider: fakeProvider({
        response: { status: 200, url: "https://portal.example/final" },
        onPageClose: () => {
          pageClosed = true;
        },
        onSessionClose: () => {
          sessionClosed = true;
        },
      }),
    });
    expect(result.method).toBe(PROBE_METHOD.BROWSER);
    expect(result.provider).toBe("fake");
    expect(result.browser?.status).toBe(200);
    expect(result.browser?.finalUrl).toBe("https://portal.example/final");
    expect(result.browser?.title).toBe("Tariff portal");
    expect(result.browser?.sessionId).toBeNull();
    expect(result.evidence).toEqual([
      PROBE_EVIDENCE.BROWSER_RESPONSE,
      PROBE_EVIDENCE.BROWSER_TEXT,
      PROBE_EVIDENCE.TARIFF_KEYWORD,
      PROBE_EVIDENCE.CUSTOMS_KEYWORD,
      PROBE_EVIDENCE.DUTY_KEYWORD,
    ]);
    expect(result.error).toBeNull();
    expect(pageClosed).toBe(true);
    expect(sessionClosed).toBe(true);
  });

  it("records null browser location when the page reports no response", async () => {
    fetchFail();
    const result = await probeWorkflow(seed, {
      browserProvider: fakeProvider({ response: null }),
    });
    expect(result.method).toBe(PROBE_METHOD.BROWSER);
    expect(result.browser?.status).toBeNull();
    expect(result.browser?.finalUrl).toBeNull();
    // No response observed, so no browser_response evidence is claimed.
    expect(result.evidence).toEqual([
      PROBE_EVIDENCE.BROWSER_TEXT,
      PROBE_EVIDENCE.TARIFF_KEYWORD,
      PROBE_EVIDENCE.CUSTOMS_KEYWORD,
      PROBE_EVIDENCE.DUTY_KEYWORD,
    ]);
  });

  it("records the provider session id for console lookup", async () => {
    fetchFail();
    const result = await probeWorkflow(seed, {
      browserProvider: fakeProvider({
        response: { status: 200, url: "https://portal.example/final" },
        sessionId: "fake-session-1",
      }),
    });
    expect(result.method).toBe(PROBE_METHOD.BROWSER);
    expect(result.browser?.sessionId).toBe("fake-session-1");
  });

  it("emits no keyword evidence when the page lacks tariff terminology", async () => {
    fetchFail();
    const result = await probeWorkflow(seed, {
      browserProvider: fakeProvider({
        response: { status: 200, url: "https://portal.example/final" },
        title: "Welcome",
        text: "News and contact details.",
      }),
    });
    expect(result.method).toBe(PROBE_METHOD.BROWSER);
    expect(result.evidence).toEqual([PROBE_EVIDENCE.BROWSER_RESPONSE, PROBE_EVIDENCE.BROWSER_TEXT]);
  });

  it("fails with the launch error when the browser provider throws", async () => {
    fetchFail();
    const result = await probeWorkflow(seed, {
      browserProvider: fakeProvider({
        response: { status: 200, url: "https://portal.example/final" },
        launchError: new Error("browser unavailable"),
      }),
    });
    expect(result.method).toBe(PROBE_METHOD.FAILED);
    expect(result.provider).toBe("fake");
    expect(result.browser).toBeNull();
    expect(result.error).toBe("browser unavailable");
  });

  it("stringifies non-Error browser failures", async () => {
    fetchFail();
    const result = await probeWorkflow(seed, {
      browserProvider: fakeProvider({
        response: { status: 200, url: "https://portal.example/final" },
        launchError: "plain failure",
      }),
    });
    expect(result.method).toBe(PROBE_METHOD.FAILED);
    expect(result.error).toBe("plain failure");
  });

  it("closes page and session when navigation throws", async () => {
    fetchFail();
    let pageClosed = false;
    let sessionClosed = false;
    const result = await probeWorkflow(seed, {
      browserProvider: fakeProvider({
        response: { status: 200, url: "https://portal.example/final" },
        gotoError: new Error("navigation failed"),
        onPageClose: () => {
          pageClosed = true;
        },
        onSessionClose: () => {
          sessionClosed = true;
        },
      }),
    });
    expect(result.method).toBe(PROBE_METHOD.FAILED);
    expect(result.error).toBe("navigation failed");
    expect(pageClosed).toBe(true);
    expect(sessionClosed).toBe(true);
  });

  it("downloads linked documents direct-first on the direct path", async () => {
    fetchPortalDocs(
      '<a href="https://cdn.example/schedule.pdf">schedule</a>',
      200,
      "application/pdf",
      new Uint8Array([1, 2, 3]),
    );
    const result = await probeWorkflow(seed);
    expect(result.method).toBe(PROBE_METHOD.DIRECT);
    expect(result.evidence).toEqual([
      PROBE_EVIDENCE.DIRECT_RESPONSE,
      PROBE_EVIDENCE.DOCUMENT_LINK,
      PROBE_EVIDENCE.ARTIFACT_STORED,
    ]);
    expect(result.artifacts).toHaveLength(1);
    const artifact = result.artifacts[0]!;
    expect(artifact.sourceUrl).toBe("https://cdn.example/schedule.pdf");
    expect(artifact.contentLength).toBe(3);
    expect(artifact.textLayer).toBe(false);
    expect(artifact.provider).toBeNull();
    expect(typeof artifact.retrievedAt).toBe("string");
  });

  it("observes links without artifacts when guarded and browserless", async () => {
    fetchPortalDocs('<a href="https://cdn.example/schedule.pdf">schedule</a>', 403, "text/html", new Uint8Array());
    const result = await probeWorkflow(seed);
    expect(result.method).toBe(PROBE_METHOD.DIRECT);
    expect(result.artifacts).toEqual([]);
    expect(result.evidence).toEqual([PROBE_EVIDENCE.DIRECT_RESPONSE, PROBE_EVIDENCE.DOCUMENT_LINK]);
  });

  it("skips link harvest for binary direct bodies", async () => {
    fetchPortalDocs("", 200, "application/pdf", new Uint8Array([1]));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.startsWith("https://cdn.example/")
          ? new Response("denied", { status: 403 })
          : {
              ok: true,
              status: 200,
              url: "https://portal.example/tariff",
              headers: { get: () => "application/pdf" },
              text: async (): Promise<string> => "",
            },
      ),
    );
    const result = await probeWorkflow(seed);
    expect(result.method).toBe(PROBE_METHOD.DIRECT);
    expect(result.artifacts).toEqual([]);
    expect(result.evidence).toEqual([PROBE_EVIDENCE.DIRECT_RESPONSE]);
  });

  it("falls back to browser streaming when direct download is guarded", async () => {
    fetchFailPortalDocs(403);
    const result = await probeWorkflow(seed, {
      browserProvider: fakeProvider({
        response: { status: 200, url: "https://portal.example/final" },
        docLinks: [
          { url: "https://cdn.example/schedule.pdf", label: "schedule" },
          { url: "https://cdn.example/schedule.pdf", label: "schedule again" },
        ],
        download: { buffer: Buffer.from([4, 5]), contentType: "application/pdf" },
      }),
    });
    expect(result.method).toBe(PROBE_METHOD.BROWSER);
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]?.provider).toBe("fake");
    expect(result.evidence).toContain(PROBE_EVIDENCE.DOCUMENT_LINK);
    expect(result.evidence).toContain(PROBE_EVIDENCE.ARTIFACT_STORED);
    expect(result.evidence).toContain(PROBE_EVIDENCE.ARTIFACT_BROWSER);
  });

  it("leaves guarded links unretrieved without page download support", async () => {
    fetchFailPortalDocs(403);
    const result = await probeWorkflow(seed, {
      browserProvider: fakeProvider({
        response: { status: 200, url: "https://portal.example/final" },
        docLinks: [{ url: "https://cdn.example/schedule.pdf", label: "schedule" }],
      }),
    });
    expect(result.method).toBe(PROBE_METHOD.BROWSER);
    expect(result.artifacts).toEqual([]);
    expect(result.evidence).toContain(PROBE_EVIDENCE.DOCUMENT_LINK);
    expect(result.evidence).not.toContain(PROBE_EVIDENCE.ARTIFACT_STORED);
  });

  it("tolerates browser download failures without revoking the observation", async () => {
    fetchFailPortalDocs(403);
    const result = await probeWorkflow(seed, {
      browserProvider: fakeProvider({
        response: { status: 200, url: "https://portal.example/final" },
        docLinks: [{ url: "https://cdn.example/schedule.pdf", label: "schedule" }],
        downloadError: new Error("session streaming failed"),
      }),
    });
    expect(result.method).toBe(PROBE_METHOD.BROWSER);
    expect(result.artifacts).toEqual([]);
    expect(result.error).toBeNull();
  });

  it("caps retrieved artifacts per seed", async () => {
    const links = Array.from({ length: MAX_ARTIFACTS_PER_SEED + 1 }, (_, index) => ({
      url: `https://cdn.example/schedule-${String(index)}.csv`,
      label: `schedule ${String(index)}`,
    }));
    fetchFailPortalDocs(403);
    const result = await probeWorkflow(seed, {
      browserProvider: fakeProvider({
        response: { status: 200, url: "https://portal.example/final" },
        docLinks: links,
        download: { buffer: Buffer.from([7]), contentType: "text/csv" },
      }),
    });
    expect(result.artifacts).toHaveLength(MAX_ARTIFACTS_PER_SEED);
    expect(result.artifacts[0]?.textLayer).toBeNull();
  });

  it("resolves relative links against the seed URL without a final URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.startsWith("https://cdn.example/")
          ? new Response(Buffer.from([1]), { status: 200, headers: { "content-type": "application/pdf" } })
          : {
              ok: true,
              status: 200,
              url: null,
              headers: { get: () => "text/html" },
              text: async (): Promise<string> => '<a href="https://cdn.example/schedule.pdf">schedule</a>',
            },
      ),
    );
    const result = await probeWorkflow(seed);
    expect(result.method).toBe(PROBE_METHOD.DIRECT);
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]?.sourceUrl).toBe("https://cdn.example/schedule.pdf");
  });

  it("records PDF text layers on browser retrievals", async () => {
    fetchFailPortalDocs(403);
    const text = `(abcdefghij) Tj\n`.repeat(30);
    const result = await probeWorkflow(seed, {
      browserProvider: fakeProvider({
        response: { status: 200, url: "https://portal.example/final" },
        docLinks: [{ url: "https://cdn.example/schedule.pdf", label: "schedule" }],
        download: { buffer: Buffer.from(`%PDF-1.7\nBT\n${text}ET\n`, "latin1"), contentType: "application/pdf" },
      }),
    });
    expect(result.artifacts[0]?.textLayer).toBe(true);
  });
});
