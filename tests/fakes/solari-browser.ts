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
