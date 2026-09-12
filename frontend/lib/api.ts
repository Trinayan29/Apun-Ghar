import { auth } from "@/lib/firebase";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

export interface AppUser {
  id: number;
  firebase_uid: string;
  email: string | null;
  email_verified: boolean;
  role: string;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  college: string | null;
  workplace: string | null;
  budget_min: number | null;
  budget_max: number | null;
  move_in_date: string | null;
  created_at: string;
  updated_at: string;
}

export type ProfilePatch = Partial<
  Pick<UserProfile, "college" | "workplace" | "budget_min" | "budget_max" | "move_in_date">
>;

async function authHeaders(): Promise<HeadersInit> {
  const token = auth.currentUser
    ? await auth.currentUser.getIdToken()
    : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = (await res.json()) as { detail?: unknown };
      if (typeof data?.detail === "string") detail = data.detail;
    } catch {
      // keep statusText
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

export const getMe = () => request<AppUser>("/api/v1/users/me");

export const getMyProfile = () =>
  request<UserProfile>("/api/v1/users/me/profile");

export const patchMyProfile = (patch: ProfilePatch) =>
  request<UserProfile>("/api/v1/users/me/profile", {
    method: "PATCH",
    body: patch,
  });
