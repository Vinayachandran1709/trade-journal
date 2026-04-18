import { storageGet, storageRemove, storageSet } from "./chrome";

export const AUTH_TOKEN_KEY = "authToken";

export async function getAuthToken(): Promise<string | null> {
  return storageGet<string>(AUTH_TOKEN_KEY);
}

export async function setAuthToken(token: string): Promise<void> {
  await storageSet(AUTH_TOKEN_KEY, token);
}

export async function clearAuthToken(): Promise<void> {
  await storageRemove(AUTH_TOKEN_KEY);
}

export function onAuthTokenChange(
  listener: (token: string | null) => void
): () => void {
  const handleChange: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (
    changes,
    areaName
  ) => {
    if (areaName !== "local" || !changes[AUTH_TOKEN_KEY]) {
      return;
    }

    listener((changes[AUTH_TOKEN_KEY].newValue as string | undefined) ?? null);
  };

  chrome.storage.onChanged.addListener(handleChange);

  return () => {
    chrome.storage.onChanged.removeListener(handleChange);
  };
}
