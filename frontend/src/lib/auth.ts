import { apiFetch } from "./api";
import type {
  LoginRequest,
  SignupRequest,
  SignupTokenResponse,
  TokenResponse,
  User,
  UserPreferences,
} from "@/types/user";

export async function signup(data: SignupRequest): Promise<User> {
  return apiFetch<User>("/auth/signup", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function signupAndLogin(data: SignupRequest): Promise<User> {
  const res = await apiFetch<SignupTokenResponse>("/auth/signup-with-token", {
    method: "POST",
    body: JSON.stringify(data),
  });
  localStorage.setItem("token", res.access_token);
  return res.user;
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

export async function updatePreferences(
  data: UserPreferences
): Promise<User> {
  return apiFetch<User>("/auth/preferences", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function logout(): void {
  localStorage.removeItem("token");
}

export function isAuthenticated(): boolean {
  return typeof window !== "undefined" && !!localStorage.getItem("token");
}
