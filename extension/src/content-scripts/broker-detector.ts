const SUPPORTED_BROKER_HOSTS = new Set([
  "kite.zerodha.com",
  "web.groww.in",
]);

const currentHost = window.location.hostname;

if (SUPPORTED_BROKER_HOSTS.has(currentHost)) {
  chrome.runtime.sendMessage(
    {
      type: "broker:page-detected",
      payload: {
        host: currentHost,
        href: window.location.href,
      },
    },
    () => {
      void chrome.runtime.lastError;
    }
  );
}
