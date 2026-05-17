const DEFAULT_WEBSTORE_URL = "https://chrome.google.com/webstore";

export type ExtensionHandoffResult =
  | {
      status: "success";
      sidePanelOpened: boolean;
      userEmail?: string;
      message: string;
    }
  | {
      status:
        | "unsupported_browser"
        | "missing_extension_id"
        | "missing_token"
        | "extension_missing"
        | "rejected"
        | "failed";
      message: string;
      webstoreUrl?: string;
    };

interface ExternalAuthHandoffResponse {
  ok?: boolean;
  userEmail?: string;
  sidePanelOpened?: boolean;
  error?: string;
}

interface WebsiteBridgeEnvelope {
  source?: string;
  type?: string;
  requestId?: string;
  response?: ExternalAuthHandoffResponse;
}

interface WebsiteBridgeDomResponseDetail {
  requestId?: string;
  response?: ExternalAuthHandoffResponse;
}

const BRIDGE_REQUEST_SOURCE = "indiacircle-web";
const BRIDGE_RESPONSE_SOURCE = "indiacircle-extension";
const BRIDGE_REQUEST_TYPE = "INDIACIRCLE_EXTENSION_HANDOFF";
const BRIDGE_RESPONSE_TYPE = "INDIACIRCLE_EXTENSION_HANDOFF_RESULT";
const BRIDGE_DOM_REQUEST_EVENT = "indiacircle:open-sidepanel";
const BRIDGE_DOM_RESPONSE_EVENT = "indiacircle:open-sidepanel-result";

function getWebStoreUrl(): string {
  return (process.env.NEXT_PUBLIC_CHROME_WEBSTORE_URL || DEFAULT_WEBSTORE_URL).trim();
}

function getExtensionId(): string {
  return (process.env.NEXT_PUBLIC_CHROME_EXTENSION_ID || "").trim();
}

function getChromeRuntime():
  | {
      sendMessage: (
        extensionId: string,
        message: Record<string, unknown>,
        callback?: (response?: ExternalAuthHandoffResponse) => void
      ) => void;
      lastError?: { message?: string };
    }
  | null {
  if (typeof window === "undefined") {
    return null;
  }

  const runtime = (
    window as Window & {
      chrome?: {
        runtime?: {
          sendMessage: (
            extensionId: string,
            message: Record<string, unknown>,
            callback?: (response?: ExternalAuthHandoffResponse) => void
          ) => void;
          lastError?: { message?: string };
        };
      };
    }
  ).chrome?.runtime;
  if (!runtime || typeof runtime.sendMessage !== "function") {
    return null;
  }

  return runtime;
}

async function attemptWebsiteBridgeHandoff(
  token: string
): Promise<ExternalAuthHandoffResponse | null> {
  if (typeof window === "undefined") {
    return null;
  }

  const requestId = `handoff_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  return new Promise<ExternalAuthHandoffResponse | null>((resolve) => {
    const timeoutId = window.setTimeout(() => {
      window.removeEventListener("message", handleMessage);
      document.removeEventListener(BRIDGE_DOM_RESPONSE_EVENT, handleDomResponse as EventListener);
      resolve(null);
    }, 1500);

    function resolveOnce(response: ExternalAuthHandoffResponse | null) {
      window.clearTimeout(timeoutId);
      window.removeEventListener("message", handleMessage);
      document.removeEventListener(BRIDGE_DOM_RESPONSE_EVENT, handleDomResponse as EventListener);
      resolve(response);
    }

    function handleMessage(event: MessageEvent<WebsiteBridgeEnvelope>) {
      if (event.source !== window) {
        return;
      }
      if (
        event.data?.source !== BRIDGE_RESPONSE_SOURCE ||
        event.data?.type !== BRIDGE_RESPONSE_TYPE ||
        event.data?.requestId !== requestId
      ) {
        return;
      }

      resolveOnce(event.data.response ?? { ok: false, error: "No response." });
    }

    function handleDomResponse(event: Event) {
      const detail = (event as CustomEvent<WebsiteBridgeDomResponseDetail>).detail;
      if (!detail || detail.requestId !== requestId) {
        return;
      }

      resolveOnce(detail.response ?? { ok: false, error: "No response." });
    }

    window.addEventListener("message", handleMessage);
    document.addEventListener(BRIDGE_DOM_RESPONSE_EVENT, handleDomResponse as EventListener);
    document.dispatchEvent(
      new CustomEvent(BRIDGE_DOM_REQUEST_EVENT, {
        detail: {
          requestId,
          token,
        },
      })
    );
    window.postMessage(
      {
        source: BRIDGE_REQUEST_SOURCE,
        type: BRIDGE_REQUEST_TYPE,
        requestId,
        token,
      },
      window.location.origin
    );
  });
}

export async function handoffWebsiteSessionToExtension(): Promise<ExtensionHandoffResult> {
  if (typeof window === "undefined") {
    return {
      status: "unsupported_browser",
      message: "Open this page in Chrome to connect IndiaCircle with your extension.",
      webstoreUrl: getWebStoreUrl(),
    };
  }

  const token = window.localStorage.getItem("token");
  if (!token) {
    return {
      status: "missing_token",
      message: "Log in first, then open your IndiaCircle side panel.",
    };
  }

  const extensionId = getExtensionId();
  if (!extensionId) {
    return {
      status: "missing_extension_id",
      message: "Extension setup is not configured in this environment yet.",
      webstoreUrl: getWebStoreUrl(),
    };
  }

  const runtime = getChromeRuntime();
  if (!runtime) {
    return {
      status: "unsupported_browser",
      message: "Open this page in Chrome to connect IndiaCircle with your extension.",
      webstoreUrl: getWebStoreUrl(),
    };
  }

  try {
    const bridgeResponse = await attemptWebsiteBridgeHandoff(token);
    const response =
      bridgeResponse ??
      (await new Promise<ExternalAuthHandoffResponse>((resolve, reject) => {
        runtime.sendMessage(
          extensionId,
          { type: "indiacircle:auth-handoff", token, source: "web" },
          (nextResponse) => {
            const lastError = runtime.lastError?.message;
            if (lastError) {
              reject(new Error(lastError));
              return;
            }
            resolve(nextResponse ?? {});
          }
        );
      }));

    if (!response.ok) {
      return {
        status: "rejected",
        message:
          response.error ||
          "Could not connect your extension yet. Try clicking the IndiaCircle icon near your address bar.",
        webstoreUrl: getWebStoreUrl(),
      };
    }

    return {
      status: "success",
      sidePanelOpened: Boolean(response.sidePanelOpened),
      userEmail: response.userEmail,
      message: response.sidePanelOpened
        ? "IndiaCircle is ready in your side panel."
        : "Session connected, but Chrome did not expose the panel automatically. Click the IndiaCircle icon near your address bar once, then pin it for one-click access.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to reach the extension.";
    const extensionMissing =
      /receiving end does not exist|could not establish connection/i.test(message);

    if (extensionMissing) {
      return {
        status: "extension_missing",
        message: "Extension not detected. Install IndiaCircle, then come back and click Open Journal Side Panel.",
        webstoreUrl: getWebStoreUrl(),
      };
    }

    return {
      status: "failed",
      message:
        "Could not open the side panel automatically. Click the IndiaCircle icon near your address bar, then pin the extension and side panel for faster access.",
      webstoreUrl: getWebStoreUrl(),
    };
  }
}
