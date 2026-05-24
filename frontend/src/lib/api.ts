function resolveApiUrl(): string {
  const configured = (process.env.NEXT_PUBLIC_API_URL || "https://indiacircle.in/api").replace(
    /\/$/,
    ""
  );

  if (typeof window !== "undefined" && window.location.protocol === "https:") {
    return configured.replace(/^http:\/\//i, "https://");
  }

  return configured;
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
