import type { CaptureState, CapturedTrade } from "./captures";
import type { TickerIntelResponse } from "./api";
import type { StockDictionaryResponse } from "./stockDictionary";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface User {
  id: number;
  email: string;
  name: string | null;
  subscription_status?: string | null;
  subscription_plan?: string | null;
  subscription_expires_at?: string | null;
  razorpay_customer_id?: string | null;
  razorpay_subscription_id?: string | null;
  preferences?: {
    brokers: string[];
    sectors: string[];
    style: string | null;
  } | null;
  created_at: string;
}

export interface ExtensionMessage {
  type:
    | "auth:get-token"
    | "auth:get-me"
    | "auth:logout"
    | "website:auth-handoff"
    | "health:ping"
    | "broker:page-detected"
    | "stocks:get-dictionary"
    | "ticker:fetch-intel"
    | "capture:submit"
    | "capture:get-state"
    | "capture:update-trade";
  payload?: Record<string, unknown>;
}

export interface ExternalAuthHandoffMessage {
  type: "indiacircle:auth-handoff";
  token?: string;
  source?: string;
}

export interface BackgroundResponse {
  ok: boolean;
  error?: string;
  token?: string | null;
  user?: User;
  timestamp?: string;
  captureState?: CaptureState;
  importedCount?: number;
  trades?: CapturedTrade[];
  tickerIntel?: TickerIntelResponse;
  stockDictionary?: StockDictionaryResponse;
  userEmail?: string;
  sidePanelOpened?: boolean;
}
