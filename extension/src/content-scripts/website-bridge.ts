type WebsiteBridgeRequest = {
  source?: string;
  type?: string;
  requestId?: string;
  token?: string;
};

type WebsiteBridgeDomDetail = {
  requestId?: string;
  token?: string;
};

const REQUEST_SOURCE = "indiacircle-web";
const REQUEST_TYPE = "INDIACIRCLE_EXTENSION_HANDOFF";
const RESPONSE_TYPE = "INDIACIRCLE_EXTENSION_HANDOFF_RESULT";
const DOM_REQUEST_EVENT = "indiacircle:open-sidepanel";
const DOM_RESPONSE_EVENT = "indiacircle:open-sidepanel-result";

function isValidRequest(data: unknown): data is WebsiteBridgeRequest {
  if (!data || typeof data !== "object") {
    return false;
  }

  const candidate = data as WebsiteBridgeRequest;
  return (
    candidate.source === REQUEST_SOURCE &&
    candidate.type === REQUEST_TYPE &&
    typeof candidate.requestId === "string" &&
    typeof candidate.token === "string"
  );
}

function sendHandoffResponse(requestId: string, response: unknown) {
  document.dispatchEvent(
    new CustomEvent(DOM_RESPONSE_EVENT, {
      detail: {
        requestId,
        response,
      },
    })
  );
  window.postMessage(
    {
      source: "indiacircle-extension",
      type: RESPONSE_TYPE,
      requestId,
      response,
    },
    window.location.origin
  );
}

function handleHandoff(requestId: string, token: string) {
  void chrome.runtime.sendMessage(
    {
      type: "website:auth-handoff",
      payload: {
        token,
        source: "website-bridge",
      },
    },
    (response) => {
      const error = chrome.runtime.lastError?.message;
      sendHandoffResponse(
        requestId,
        error ? { ok: false, error } : response ?? { ok: false, error: "No response." }
      );
    }
  );
}

window.addEventListener("message", (event) => {
  if (event.source !== window || !isValidRequest(event.data)) {
    return;
  }

  const { requestId, token } = event.data as { requestId: string; token: string };
  handleHandoff(requestId, token);
});

document.addEventListener(DOM_REQUEST_EVENT, (event) => {
  const detail = (event as CustomEvent<WebsiteBridgeDomDetail>).detail;
  if (!detail || typeof detail.requestId !== "string" || typeof detail.token !== "string") {
    return;
  }

  const { requestId, token } = detail as { requestId: string; token: string };
  handleHandoff(requestId, token);
});
