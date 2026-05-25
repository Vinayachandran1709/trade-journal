const DEFAULT_DEVELOPMENT_API_URL = "http://localhost:8000/api";
const LOCALHOST_PATTERN =
  /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i;

function isProductionBuild(): boolean {
  return process.env.NODE_ENV === "production";
}

function shouldEnforceProductionUrl(): boolean {
  return isProductionBuild();
}

function validateApiUrl(url: string) {
  if (!shouldEnforceProductionUrl()) {
    return;
  }

  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_API_URL is missing for this production build. Set it to the HTTPS IndiaCircle API URL."
    );
  }

  if (LOCALHOST_PATTERN.test(url)) {
    throw new Error(
      "NEXT_PUBLIC_API_URL cannot use localhost or 127.0.0.1 in production."
    );
  }

  if (!url.startsWith("https://")) {
    throw new Error(
      "NEXT_PUBLIC_API_URL must use HTTPS in production."
    );
  }
}

function resolveApiUrl(): string {
  const configured = (process.env.NEXT_PUBLIC_API_URL || "").trim().replace(/\/$/, "");
  const resolved = configured || (isProductionBuild() ? "" : DEFAULT_DEVELOPMENT_API_URL);
  validateApiUrl(resolved);
  return resolved;
}

export const API_URL = resolveApiUrl();

type ApiFetchOptions = RequestInit & {
  timeoutMs?: number;
  retryOnTimeout?: boolean;
};

export async function apiFetch<T>(
  endpoint: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const {
    timeoutMs = 30000,
    retryOnTimeout = true,
    ...requestOptions
  } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((requestOptions.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const method = (requestOptions.method || "GET").toUpperCase();

  async function runFetch(): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(`${API_URL}${endpoint}`, {
        ...requestOptions,
        headers,
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error("Request timed out. Please try again.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  let res: Response;
  try {
    res = await runFetch();
  } catch (error) {
    const shouldRetry =
      retryOnTimeout &&
      method === "GET" &&
      error instanceof Error &&
      error.message === "Request timed out. Please try again.";

    if (!shouldRetry) {
      throw error;
    }
    res = await runFetch();
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Request failed" }));
    if (res.status === 401) {
      if (typeof window !== "undefined") {
        localStorage.removeItem("token");
        window.location.href = "/login";
      }
    }
    throw new Error(error.detail || `Error ${res.status}`);
  }

  return res.json();
}
