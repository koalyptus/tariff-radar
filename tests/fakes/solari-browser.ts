// Test-only fake for `@solarisdk/browser`, wired via the `resolve.alias` entry
// in vitest.config.ts. It never touches the network. The control object lets
// each test steer the fake browser's behaviour.
export const solariControl = {
  apiKey: "",
  launchOptions: {} as Record<string, unknown>,
  launchError: undefined as unknown,
  gotoResponse: "response" as "response" | "none",
  browserClosed: false,
  clientClosed: false,
  pageClosed: false,
  browserCloseError: undefined as unknown,
  anchors: [] as Array<{ href: string | null; label: string | null }>,
  pageUrl: "https://portal.example/final",
  download: {
    ok: true,
    status: 200,
    headers: { "content-type": "application/pdf" } as Record<string, string>,
    body: new Uint8Array([1, 2, 3]),
  },
  downloadError: undefined as unknown,
};

export function resetSolariControl() {
  solariControl.apiKey = "";
  solariControl.launchOptions = {};
  solariControl.launchError = undefined;
  solariControl.gotoResponse = "response";
  solariControl.browserClosed = false;
  solariControl.clientClosed = false;
  solariControl.pageClosed = false;
  solariControl.browserCloseError = undefined;
  solariControl.anchors = [];
  solariControl.pageUrl = "https://portal.example/final";
  solariControl.download = {
    ok: true,
    status: 200,
    headers: { "content-type": "application/pdf" },
    body: new Uint8Array([1, 2, 3]),
  };
  solariControl.downloadError = undefined;
}

export class Solari {
  private closed = false;

  constructor(options: { apiKey: string }) {
    solariControl.apiKey = options.apiKey;
  }

  async launch(options: Record<string, unknown>) {
    // Mirror the SDK: closing the client shuts its loopback proxy down, so
    // launching again on the same client fails. The adapter must open a
    // fresh client per session.
    if (this.closed) {
      throw new Error("LocalProxy not started");
    }
    if (solariControl.launchError !== undefined) {
      throw solariControl.launchError;
    }
    solariControl.launchOptions = options;
    return {
      id: "test-session-id",
      newPage: async () => ({
        goto: async () => {
          if (solariControl.gotoResponse === "none") {
            return null;
          }
          return {
            status: () => 200,
            url: () => "https://portal.example/final",
          };
        },
        title: async () => "Tariff portal",
        locator: () => ({
          innerText: async () => "customs duty tariff",
        }),
        // Execute the adapter's callback in Node against the test-stubbed
        // `document` global, so the real harvest logic is exercised.
        evaluate: async (pageFunction: () => unknown) => pageFunction(),
        url: () => solariControl.pageUrl,
        request: {
          get: async () => {
            if (solariControl.downloadError !== undefined) {
              throw solariControl.downloadError;
            }
            const download = solariControl.download;
            return {
              ok: () => download.ok,
              status: () => download.status,
              headers: () => download.headers,
              body: async () => Buffer.from(download.body),
            };
          },
        },
        close: async () => {
          solariControl.pageClosed = true;
        },
      }),
      close: async () => {
        if (solariControl.browserCloseError !== undefined) {
          throw solariControl.browserCloseError;
        }
        solariControl.browserClosed = true;
      },
    };
  }

  async close() {
    this.closed = true;
    solariControl.clientClosed = true;
  }
}
