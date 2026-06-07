import { getApiUrl } from "@/lib/api";

export const BROKER_OPTIONS = [
  "Dhan",
  "Zerodha",
  "Groww",
  "Angel One",
  "Upstox",
  "Shoonya",
] as const;

export type BrokerOption = (typeof BROKER_OPTIONS)[number];

export type WaitlistRequest = {
  name: string;
  email: string;
  broker: BrokerOption;
  early_access: boolean;
  source: string;
};

export type WaitlistResponse = {
  success: true;
  id: number;
  email: string;
  broker: BrokerOption;
  early_access: boolean;
  created_at: string;
};

export async function submitWaitlist(
  payload: WaitlistRequest
): Promise<WaitlistResponse> {
  const response = await fetch(`${getApiUrl()}/public/waitlist`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: "Unable to join waitlist" }));
    throw new Error(error.detail || "Unable to join waitlist");
  }

  return response.json();
}
