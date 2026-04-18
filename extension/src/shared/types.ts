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
  created_at: string;
}

export interface ExtensionMessage {
  type:
    | "auth:get-token"
    | "auth:get-me"
    | "auth:logout"
    | "health:ping"
    | "broker:page-detected";
  payload?: Record<string, unknown>;
}

export interface BackgroundResponse {
  ok: boolean;
  error?: string;
  token?: string | null;
  user?: User;
  timestamp?: string;
}
