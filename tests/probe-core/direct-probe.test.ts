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

  it("stays non-negative when the wall clock jumps backwards", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => okResponse()),
    );
    const now = vi.spyOn(Date, "now").mockReturnValueOnce(1_000_000).mockReturnValueOnce(500_000);
    try {
      const result = await runDirectProbe("https://portal.example/tariff");
      expect(result.ok).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    } finally {
      now.mockRestore();
    }
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
    expect(result.error).toBe("timeout after 5ms");
  });

  it("surfaces the underlying cause behind fetch failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed", { cause: new Error("getaddrinfo ENOTFOUND portal.example") });
      }),
    );
    const result = await runDirectProbe("https://portal.example/");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("getaddrinfo ENOTFOUND portal.example");
  });

  it("names anonymous failures instead of printing empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error();
      }),
    );
    const anonymous = await runDirectProbe("https://portal.example/");
    expect(anonymous.error).toBe("fetch failed (unknown reason)");
  });

  it("stringifies a non-Error cause behind an empty message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const error = new Error();
        (error as { cause?: unknown }).cause = "socket hung up";
        throw error;
      }),
    );
    const result = await runDirectProbe("https://portal.example/");
    expect(result.error).toBe("fetch failed (socket hung up)");
  });

  it("ignores an empty cause message in favor of a reason", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const error = new Error() as Error & { cause?: unknown };
        error.cause = new Error();
        throw error;
      }),
    );
    const result = await runDirectProbe("https://portal.example/");
    expect(result.error).toBe("fetch failed (Error)");
  });
});
