import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_ARTIFACT_BYTES,
  PDF_TEXT_LAYER_MIN_CHARS,
  extractDocumentLinksFromHtml,
  fetchArtifact,
  hasPdfTextLayer,
} from "@tariff-radar/probe-core";

const DOC_URL = "https://portal.example/schedule.pdf";

function stubFetch(handler: () => Promise<Response> | Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => handler()),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchArtifact", () => {
  it("returns bytes for a binary 2xx response", async () => {
    stubFetch(
      () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "application/pdf" } }),
    );
    const result = await fetchArtifact(DOC_URL);
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.contentType).toBe("application/pdf");
    expect(result.data).toEqual(Buffer.from([1, 2, 3]));
    expect(result.error).toBeNull();
  });

  it("folds non-2xx statuses into the result", async () => {
    stubFetch(() => new Response("denied", { status: 403, headers: { "content-type": "text/html" } }));
    const result = await fetchArtifact(DOC_URL);
    expect(result).toMatchObject({ ok: false, status: 403, error: "HTTP 403" });
    expect(result.data).toEqual(Buffer.alloc(0));
    expect(result.contentType).toBe("text/html");
  });

  it("refuses HTML bodies as guard observations, not artifacts", async () => {
    stubFetch(() => new Response("<html>challenge</html>", { status: 200, headers: { "content-type": "text/html" } }));
    const result = await fetchArtifact(DOC_URL);
    expect(result.ok).toBe(false);
    expect(result.data).toEqual(Buffer.alloc(0));
    expect(result.error).toBe("unexpected content-type text/html");
  });

  it("accepts an empty content type as an unknown binary", async () => {
    stubFetch(() => new Response(new Uint8Array([9]), { status: 200 }));
    const result = await fetchArtifact(DOC_URL);
    expect(result.ok).toBe(true);
    expect(result.data).toEqual(Buffer.from([9]));
  });

  it("accepts a null body as an empty artifact", async () => {
    stubFetch(
      () =>
        ({
          ok: true,
          status: 200,
          body: null,
        }) as unknown as Response,
    );
    const result = await fetchArtifact(DOC_URL);
    expect(result.ok).toBe(true);
    expect(result.contentType).toBe("");
    expect(result.data).toEqual(Buffer.alloc(0));
  });

  it("aborts bodies past the byte cap", async () => {
    const chunk = new Uint8Array(10 * 1024);
    let emitted = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        emitted += 1;
        if (emitted > Math.ceil(MAX_ARTIFACT_BYTES / chunk.byteLength) + 1) {
          controller.close();
          return;
        }
        controller.enqueue(chunk);
      },
    });
    stubFetch(
      () =>
        ({
          ok: true,
          status: 200,
          headers: { get: () => "application/pdf" },
          body,
        }) as unknown as Response,
    );
    const result = await fetchArtifact(DOC_URL);
    expect(result.ok).toBe(false);
    expect(result.data).toEqual(Buffer.alloc(0));
    expect(result.error).toBe(`body exceeds ${String(MAX_ARTIFACT_BYTES)} bytes`);
  });

  it("treats unreadable bodies as over-cap failures without throwing", async () => {
    stubFetch(
      () =>
        ({
          ok: true,
          status: 200,
          headers: { get: () => "application/pdf" },
          body: {
            getReader: () => ({
              read: async () => {
                throw new Error("stream reset");
              },
              releaseLock: () => undefined,
              cancel: async () => undefined,
            }),
          },
        }) as unknown as Response,
    );
    const result = await fetchArtifact(DOC_URL);
    expect(result.ok).toBe(false);
    expect(result.error).toBe(`body exceeds ${String(MAX_ARTIFACT_BYTES)} bytes`);
  });

  it("names network failures instead of throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connection refused");
      }),
    );
    const result = await fetchArtifact(DOC_URL);
    expect(result.ok).toBe(false);
    expect(result.status).toBeNull();
    expect(result.contentType).toBe("");
    expect(result.data).toEqual(Buffer.alloc(0));
    expect(result.error).toBe("connection refused");
  });

  it("stringifies non-Error rejections", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw "string-fail";
      }),
    );
    const result = await fetchArtifact(DOC_URL);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("string-fail");
  });
});

describe("extractDocumentLinksFromHtml", () => {
  it("harvests absolute and relative links with labels", () => {
    const html = [
      '<a href="https://portal.example/schedule.pdf">2026 <b>schedule</b></a>',
      '<a href="/docs/rates.xlsx">rates</a>',
      "<a href='notes.csv'>notes</a>",
      "<a href=plain.xls>plain</a>",
    ].join("");
    expect(extractDocumentLinksFromHtml(html, "https://portal.example/tariff")).toEqual([
      { url: "https://portal.example/schedule.pdf", label: "2026 schedule" },
      { url: "https://portal.example/docs/rates.xlsx", label: "rates" },
      { url: "https://portal.example/notes.csv", label: "notes" },
      { url: "https://portal.example/plain.xls", label: "plain" },
    ]);
  });

  it("ignores non-document hrefs, duplicates, and garbage", () => {
    const html = [
      '<a href="https://portal.example/about">about</a>',
      '<a href="https://portal.example/schedule.pdf?v=2#page=1">v2</a>',
      '<a href="https://portal.example/schedule.pdf?v=2#page=1">v2 again</a>',
      '<a href="javascript:void(0)">dynamic</a>',
      '<a href="https://exa mple/schedule.pdf">broken</a>',
      '<a href="SCHEDULE.PDF">upper</a>',
    ].join("");
    expect(extractDocumentLinksFromHtml(html, "https://portal.example/tariff")).toEqual([
      { url: "https://portal.example/schedule.pdf?v=2#page=1", label: "v2" },
      { url: "https://portal.example/SCHEDULE.PDF", label: "upper" },
    ]);
  });

  it("returns empty for markup without document anchors", () => {
    expect(extractDocumentLinksFromHtml("<html><body>no links</body></html>", DOC_URL)).toEqual([]);
  });
});

describe("hasPdfTextLayer", () => {
  function textPdf(chars: number): Buffer {
    const line = `(abcdefghij) Tj\n`.repeat(Math.ceil(chars / 10));
    return Buffer.from(`%PDF-1.7\n1 0 obj\nBT\n${line}ET\n`, "latin1");
  }

  it("detects a text layer past the character threshold", () => {
    expect(hasPdfTextLayer(textPdf(PDF_TEXT_LAYER_MIN_CHARS + 10))).toBe(true);
  });

  it("rejects scanned PDFs without text operators", () => {
    expect(hasPdfTextLayer(Buffer.from("%PDF-1.7\n1 0 obj\n/Images0 Do\n", "latin1"))).toBe(false);
  });

  it("rejects PDFs with too little text", () => {
    expect(hasPdfTextLayer(textPdf(10))).toBe(false);
  });

  it("rejects PDFs with operators but no text strings", () => {
    expect(hasPdfTextLayer(Buffer.from("%PDF-1.7\n1 0 obj\nBT 0 0 Td /F1 12 Tf TJ ET\n", "latin1"))).toBe(false);
  });

  it("rejects non-PDF buffers", () => {
    expect(hasPdfTextLayer(Buffer.from("PK\x03\x04zip with (text) Tj inside"))).toBe(false);
  });
});
