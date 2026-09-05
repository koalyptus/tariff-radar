import { afterEach, describe, expect, it, vi } from "vitest";
import { runDirectProbe } from "@tariff-radar/probe-core";

function okResponse() {
  return { ok: true, status: 200, url: "https://portal.example/tariff" };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("runDirectProbe", () => {
  it("returns ok for an HTTP 200 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => okResponse()),
    );
    const result = await runDirectProbe("https://portal.example/tariff");
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.finalUrl).toBe("https://portal.example/tariff");
    expect(result.error).toBeNull();
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("reports HTTP failure statuses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503, url: "https://portal.example/" })),
    );
    const result = await runDirectProbe("https://portal.example/");
    expect(result.ok).toBe(false);
    expect(result.status).toBe(503);
    expect(result.error).toBe("HTTP 503");
  });

  it("reports network errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connection refused");
      }),
    );
    const result = await runDirectProbe("https://portal.example/");
    expect(result.ok).toBe(false);
    expect(result.status).toBeNull();
    expect(result.finalUrl).toBeNull();
    expect(result.error).toBe("connection refused");
  });

  it("reports non-Error rejections", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        // Intentionally non-Error to cover the String() fallback.
        throw "plain failure";
      }),
    );
    const result = await runDirectProbe("https://portal.example/");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("plain failure");
  });

  it("times out a hanging request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: unknown, init?: { signal?: AbortSignal | null }) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
          }),
      ),
    );
    const result = await runDirectProbe("https://portal.example/", 5);
    expect(result.ok).toBe(false);
    expect(result.status).toBeNull();
    expect(result.error).not.toBeNull();
  });
});
