const DEFAULT_DEV_API_BASE_URL = "http://localhost:8000";
const DEFAULT_DEV_WEB_APP_URL = "http://localhost:3000";
const LOCALHOST_PATTERN =
  /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i;

declare const __STRICT_PROD_URLS__: boolean;

function isProductionBuild(): boolean {
  return import.meta.env.MODE === "production" && __STRICT_PROD_URLS__;
}

function validateProductionUrl(value: string, name: string) {
  if (!isProductionBuild()) {
    return;
  }

  if (!value) {
    throw new Error(`${name} is required for production extension builds.`);
  }

  if (LOCALHOST_PATTERN.test(value)) {
    throw new Error(
      `${name} cannot point to localhost or 127.0.0.1 in a production extension build.`
    );
  }

  if (!value.startsWith("https://")) {
    throw new Error(`${name} must use HTTPS in a production extension build.`);
  }
}

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/$/, "");
}

export function getExtensionApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL || "";
  const value = normalizeUrl(
    configured || (isProductionBuild() ? "" : DEFAULT_DEV_API_BASE_URL)
  );
  validateProductionUrl(value, "VITE_API_BASE_URL");
  return value;
}

export function getExtensionWebAppUrl(): string {
  const configured = import.meta.env.VITE_WEB_APP_URL || "";
  const value = normalizeUrl(
    configured || (isProductionBuild() ? "" : DEFAULT_DEV_WEB_APP_URL)
  );
  validateProductionUrl(value, "VITE_WEB_APP_URL");
  return value;
}
