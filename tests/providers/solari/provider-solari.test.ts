import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_ARTIFACT_BYTES } from "@tariff-radar/probe-core";
import { SolariBrowserProvider } from "@tariff-radar/provider-solari";
import { resetSolariControl, solariControl } from "../../fakes/solari-browser.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Serve the control anchors as DOM-like nodes: the fake page executes the
 * adapter's real `evaluate` callback against this stub.
 */
function stubDocument() {
  vi.stubGlobal("document", {
    querySelectorAll: () =>
      solariControl.anchors.map((anchor) => ({
        getAttribute: () => anchor.href,
        textContent: anchor.label,
      })),
  });
}

describe("SolariBrowserProvider", () => {
  it("maps probe options and returns page observations", async () => {
    resetSolariControl();
    const provider = new SolariBrowserProvider({ apiKey: "test-key" });
    expect(provider.name).toBe("solari");

    const session = await provider.launch({
      stealth: true,
      captcha: true,
      proxyCountry: "mx",
    });
    expect(session.sessionId).toBe("test-session-id");
    expect(solariControl.apiKey).toBe("test-key");
    expect(solariControl.launchOptions).toEqual({
      stealth: true,
      captcha: true,
      proxy: "mx",
    });

    const page = await session.newPage();
    const response = await page.goto("https://portal.example/");
    expect(response?.status()).toBe(200);
    expect(response?.url()).toBe("https://portal.example/final");
    expect(await page.title()).toBe("Tariff portal");
    expect(await page.text()).toBe("customs duty tariff");

    await page.close();
    await session.close();
    expect(solariControl.pageClosed).toBe(true);
    expect(solariControl.browserClosed).toBe(true);
    expect(solariControl.clientClosed).toBe(true);
  });

  it("passes no options by default and tolerates a missing response", async () => {
    resetSolariControl();
    solariControl.gotoResponse = "none";
    const provider = new SolariBrowserProvider({ apiKey: "test-key" });
    const session = await provider.launch();
    expect(solariControl.launchOptions).toEqual({
      stealth: undefined,
      captcha: undefined,
      proxy: undefined,
    });
    const page = await session.newPage();
    expect(await page.goto("https://portal.example/")).toBeNull();
    await page.close();
    await session.close();
  });

  it("still closes the client when the browser fails to close", async () => {
    resetSolariControl();
    solariControl.browserCloseError = new Error("browser crashed");
    const provider = new SolariBrowserProvider({ apiKey: "test-key" });
    const session = await provider.launch();
    await expect(session.close()).rejects.toThrow("browser crashed");
    expect(solariControl.browserClosed).toBe(false);
    expect(solariControl.clientClosed).toBe(true);
  });

  it("supports sequential launches from one provider instance", async () => {
    resetSolariControl();
    const provider = new SolariBrowserProvider({ apiKey: "test-key" });
    const first = await provider.launch();
    await (await first.newPage()).close();
    await first.close();
    expect(solariControl.clientClosed).toBe(true);
    // A second launch on the same provider must open a fresh client: the
    // first session's close shut the previous loopback proxy down.
    const second = await provider.launch();
    await (await second.newPage()).close();
    await expect(second.close()).resolves.toBeUndefined();
  });

  it("releases the client when the browser fails to start", async () => {
    resetSolariControl();
    solariControl.launchError = new Error("browser unavailable");
    const provider = new SolariBrowserProvider({ apiKey: "test-" + "key" });
    await expect(provider.launch()).rejects.toThrow("browser unavailable");
    expect(solariControl.clientClosed).toBe(true);
  });

  it("harvests rendered document links, skipping noise", async () => {
    resetSolariControl();
    stubDocument();
    solariControl.pageUrl = "https://portal.example/tariff";
    solariControl.anchors = [
      { href: "https://cdn.example/schedule.pdf", label: "schedule" },
      { href: "/docs/rates.xlsx", label: "rates" },
      { href: "/docs/rates.xlsx", label: "rates again" },
      { href: "https://portal.example/about", label: "about" },
      { href: "javascript:void(0)", label: "dynamic" },
      { href: null, label: "no href" },
      { href: "https://exa mple/broken.pdf", label: null },
    ];
    const provider = new SolariBrowserProvider({ apiKey: "test-" + "key" });
    const session = await provider.launch();
    const page = await session.newPage();
    try {
      await expect(page.extractDocumentLinks?.()).resolves.toEqual([
        { url: "https://cdn.example/schedule.pdf", label: "schedule" },
        { url: "https://portal.example/docs/rates.xlsx", label: "rates" },
      ]);
    } finally {
      await page.close();
      await session.close();
    }
  });

  it("streams session artifacts with the observed content type", async () => {
    resetSolariControl();
    const provider = new SolariBrowserProvider({ apiKey: "test-" + "key" });
    const session = await provider.launch();
    const page = await session.newPage();
    try {
      const artifact = await page.downloadArtifact?.("https://cdn.example/schedule.pdf");
      expect(artifact?.buffer).toEqual(Buffer.from([1, 2, 3]));
      expect(artifact?.contentType).toBe("application/pdf");
      expect(artifact?.contentLength).toBe(3);
    } finally {
      await page.close();
      await session.close();
    }
  });

  it("throws for guarded session downloads", async () => {
    resetSolariControl();
    solariControl.download = {
      ok: false,
      status: 403,
      headers: { "content-type": "text/html" },
      body: new Uint8Array(),
    };
    const provider = new SolariBrowserProvider({ apiKey: "test-" + "key" });
    const session = await provider.launch();
    const page = await session.newPage();
    try {
      await expect(page.downloadArtifact?.("https://cdn.example/schedule.pdf")).rejects.toThrow("HTTP 403");
    } finally {
      await page.close();
      await session.close();
    }
  });

  it("refuses HTML bodies from session downloads", async () => {
    resetSolariControl();
    solariControl.download = {
      ok: true,
      status: 200,
      headers: { "content-type": "text/html" },
      body: new Uint8Array([60, 104, 116, 109, 108, 62]),
    };
    const provider = new SolariBrowserProvider({ apiKey: "test-" + "key" });
    const session = await provider.launch();
    const page = await session.newPage();
    try {
      await expect(page.downloadArtifact?.("https://cdn.example/schedule.pdf")).rejects.toThrow(
        "unexpected content-type text/html",
      );
    } finally {
      await page.close();
      await session.close();
    }
  });

  it("refuses over-cap session downloads", async () => {
    resetSolariControl();
    solariControl.download = {
      ok: true,
      status: 200,
      headers: { "content-type": "application/pdf" },
      body: new Uint8Array(MAX_ARTIFACT_BYTES + 1),
    };
    const provider = new SolariBrowserProvider({ apiKey: "test-" + "key" });
    const session = await provider.launch();
    const page = await session.newPage();
    try {
      await expect(page.downloadArtifact?.("https://cdn.example/schedule.pdf")).rejects.toThrow(
        `body exceeds ${String(MAX_ARTIFACT_BYTES)} bytes`,
      );
    } finally {
      await page.close();
      await session.close();
    }
  });

  it("tolerates session downloads without a content type", async () => {
    resetSolariControl();
    solariControl.download = { ok: true, status: 200, headers: {}, body: new Uint8Array([1]) };
    const provider = new SolariBrowserProvider({ apiKey: "test-" + "key" });
    const session = await provider.launch();
    const page = await session.newPage();
    try {
      const artifact = await page.downloadArtifact?.("https://cdn.example/schedule");
      expect(artifact?.contentType).toBe("");
      expect(artifact?.contentLength).toBe(1);
    } finally {
      await page.close();
      await session.close();
    }
  });
});
