import { apiFetch } from "./api";
import type { LoginRequest, SignupRequest, TokenResponse, User } from "@/types/user";

export async function signup(data: SignupRequest): Promise<User> {
  return apiFetch<User>("/auth/signup", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function login(data: LoginRequest): Promise<string> {
  const res = await apiFetch<TokenResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(data),
  });
  localStorage.setItem("token", res.access_token);
  return res.access_token;
}

export async function getMe(): Promise<User> {
  return apiFetch<User>("/auth/me");
}

export function logout(): void {
  localStorage.removeItem("token");
}

export function isAuthenticated(): boolean {
  return typeof window !== "undefined" && !!localStorage.getItem("token");
}
