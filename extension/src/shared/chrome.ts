function getRuntimeErrorMessage(): string | null {
  return chrome.runtime.lastError?.message ?? null;
}

export async function storageGet<T>(key: string): Promise<T | null> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([key], (result) => {
      const errorMessage = getRuntimeErrorMessage();
      if (errorMessage) {
        reject(new Error(errorMessage));
        return;
      }

      resolve((result[key] as T | undefined) ?? null);
    });
  });
}

export async function storageGetAll<T extends Record<string, unknown>>(): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(null, (result) => {
      const errorMessage = getRuntimeErrorMessage();
      if (errorMessage) {
        reject(new Error(errorMessage));
        return;
      }

      resolve(result as T);
    });
  });
}

export async function storageSet<T>(key: string, value: T): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [key]: value }, () => {
      const errorMessage = getRuntimeErrorMessage();
      if (errorMessage) {
        reject(new Error(errorMessage));
        return;
      }

      resolve();
    });
  });
}

export async function storageRemove(key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(key, () => {
      const errorMessage = getRuntimeErrorMessage();
      if (errorMessage) {
        reject(new Error(errorMessage));
        return;
      }

      resolve();
    });
  });
}

export async function storageRemoveMany(keys: string[]): Promise<void> {
  if (keys.length === 0) {
    return;
  }

  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(keys, () => {
      const errorMessage = getRuntimeErrorMessage();
      if (errorMessage) {
        reject(new Error(errorMessage));
        return;
      }

      resolve();
    });
  });
}
