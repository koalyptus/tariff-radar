import { describe, expect, it } from "vitest";
import { SolariBrowserProvider } from "@tariff-radar/provider-solari";
import { resetSolariControl, solariControl } from "../../fakes/solari-browser.js";

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
    const provider = new SolariBrowserProvider({ apiKey: "test-key" });
    await expect(provider.launch()).rejects.toThrow("browser unavailable");
    expect(solariControl.clientClosed).toBe(true);
  });
});
