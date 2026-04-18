import { apiFetch } from "./api";

export interface CreateOrderResponse {
  order_id: string;
  amount: number;
  currency: string;
  plan: string;
}

export interface VerifyPaymentResponse {
  status: string;
  subscription_status: string;
  plan: string;
  expires_at: string;
}

export interface BillingStatus {
  subscription_status: string | null;
  subscription_plan: string | null;
  subscription_expires_at: string | null;
  razorpay_subscription_id: string | null;
}

export interface ApplyCouponResponse {
  status: string;
  message: string;
  expires_at: string;
}

export async function createOrder(plan: string): Promise<CreateOrderResponse> {
  return apiFetch<CreateOrderResponse>("/billing/create-order", {
    method: "POST",
    body: JSON.stringify({ plan }),
  });
}

export async function verifyPayment(
  order_id: string,
  payment_id: string,
  signature: string
): Promise<VerifyPaymentResponse> {
  return apiFetch<VerifyPaymentResponse>("/billing/verify-payment", {
    method: "POST",
    body: JSON.stringify({ order_id, payment_id, signature }),
  });
}

export async function getBillingStatus(): Promise<BillingStatus> {
  return apiFetch<BillingStatus>("/billing/status");
}

export async function cancelSubscription(): Promise<{ status: string; message: string }> {
  return apiFetch("/billing/cancel", { method: "POST" });
}

export async function applyCoupon(code: string): Promise<ApplyCouponResponse> {
  return apiFetch<ApplyCouponResponse>("/billing/apply-coupon", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}
