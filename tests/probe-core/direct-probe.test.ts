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
    const seen: Array<{ url: unknown; init?: { headers?: Record<string, string> } }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown, init?: { headers?: Record<string, string> }) => {
        seen.push({ url, init });
        return okResponse();
      }),
    );
    const result = await runDirectProbe("https://portal.example/tariff");
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.finalUrl).toBe("https://portal.example/tariff");
    expect(result.error).toBeNull();
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.attempts).toBe(1);
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
    const result = await runDirectProbe("https://portal.example/", undefined, 1);
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
    const result = await runDirectProbe("https://portal.example/", undefined, 1);
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
    const result = await runDirectProbe("https://portal.example/", undefined, 1);
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
    const result = await runDirectProbe("https://portal.example/", undefined, 1);
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
    const anonymous = await runDirectProbe("https://portal.example/", undefined, 1);
    expect(anonymous.error).toBe("fetch failed (unknown reason)");
  });

  it("surfaces a non-Error cause behind an empty message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const error = new Error();
        (error as { cause?: unknown }).cause = "socket hung up";
        throw error;
      }),
    );
    const result = await runDirectProbe("https://portal.example/", undefined, 1);
    expect(result.error).toBe("socket hung up");
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
    const result = await runDirectProbe("https://portal.example/", undefined, 1);
    expect(result.error).toBe("fetch failed (Error)");
  });

  it("unwraps AggregateError attempt lists behind fetch failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed", {
          cause: new AggregateError([new Error("connect ETIMEDOUT 161.148.164.31:443")], ""),
        });
      }),
    );
    const result = await runDirectProbe("https://portal.example/", undefined, 1);
    expect(result.error).toBe("connect ETIMEDOUT 161.148.164.31:443");
  });

  it("unwraps a bare AggregateError rejection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new AggregateError([new Error("connect ENETUNREACH ::1:443")], "");
      }),
    );
    const result = await runDirectProbe("https://portal.example/", undefined, 1);
    expect(result.error).toBe("connect ENETUNREACH ::1:443");
  });

  it("retries a flaky portal and reports the winning attempt", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        if (calls === 1) {
          throw new Error("connection refused");
        }
        return okResponse();
      }),
    );
    const result = await runDirectProbe("https://portal.example/tariff");
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.error).toBeNull();
    expect(result.attempts).toBe(2);
    expect(calls).toBe(2);
  });

  it("reports the last error when attempts run out", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        seen.push("try");
        throw new Error("connection refused");
      }),
    );
    const result = await runDirectProbe("https://portal.example/", undefined, 2);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("connection refused");
    expect(result.attempts).toBe(2);
    expect(seen).toHaveLength(2);
  });

  it("reports zero attempts when none are allowed", async () => {
    const result = await runDirectProbe("https://portal.example/", undefined, 0);
    expect(result.ok).toBe(false);
    expect(result.attempts).toBe(0);
    expect(result.error).toBe("no attempts made");
  });

  it("clamps negative attempts to zero", async () => {
    const result = await runDirectProbe("https://portal.example/", undefined, -2);
    expect(result.ok).toBe(false);
    expect(result.attempts).toBe(0);
    expect(result.error).toBe("no attempts made");
  });

  it("skips empty entries inside AggregateError lists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed", { cause: new AggregateError([new Error()], "") });
      }),
    );
    const result = await runDirectProbe("https://portal.example/");
    expect(result.error).toBe("fetch failed");
  });
});
