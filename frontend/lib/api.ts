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

export type AppRole = "USER" | "OWNER" | "ADMIN";

export interface AppUser {
  id: number;
  firebase_uid: string;
  email: string | null;
  email_verified: boolean;
  role: AppRole;
  display_name: string | null;
  phone_number: string | null;
  created_at: string;
  updated_at: string;
}

export interface LocationItem {
  id: number;
  type: string;
  name: string;
  city: string;
}

export interface UserProfile {
  college_location_id: number | null;
  college_location: LocationItem | null;
  workplace_location_id: number | null;
  workplace_location: LocationItem | null;
  budget_min: number | null;
  budget_max: number | null;
  move_in_date: string | null;
  created_at: string;
  updated_at: string;
}

export type ProfilePatch = Partial<
  Pick<
    UserProfile,
    | "college_location_id"
    | "workplace_location_id"
    | "budget_min"
    | "budget_max"
    | "move_in_date"
  >
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

/** Authenticated JSON POST used by the owner-listing submit flow. */
export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: "POST", body });
}

/** Authenticated JSON PUT (price-components bulk replace). Same auth as apiPost. */
export function apiPut<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: "PUT", body });
}

/** Authenticated JSON GET (listing 409-recovery lookup). Same auth as apiPost. */
export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path);
}

export interface OwnerSignupPayload {
  display_name: string;
  phone_number: string;
}

/**
 * Create (or idempotently confirm) an OWNER account for the currently
 * signed-in Firebase identity. Call this BEFORE any getMe() for a fresh
 * Firebase identity — /users/me auto-provisions unknown users as USER,
 * which would turn this into a 409 ACCOUNT_TYPE_CONFLICT.
 */
export const ownerSignup = (payload: OwnerSignupPayload) =>
  request<AppUser>("/api/v1/owners/signup", {
    method: "POST",
    body: payload,
  });

/** Backend detail string when a Firebase identity already has another role. */
export const ACCOUNT_TYPE_CONFLICT = "ACCOUNT_TYPE_CONFLICT";

export function isAccountTypeConflict(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    err.status === 409 &&
    err.message.includes(ACCOUNT_TYPE_CONFLICT)
  );
}

export const getMyProfile = () =>
  request<UserProfile>("/api/v1/users/me/profile");

export const patchMyProfile = (patch: ProfilePatch) =>
  request<UserProfile>("/api/v1/users/me/profile", {
    method: "PATCH",
    body: patch,
  });

/* ------------------------------------------------------------------ */
/* Owner Studio inventory reads (Phase A aggregation foundation)        */
/* Minimal structural mirrors: only the fields the aggregation layer    */
/* consumes. Backend returns richer objects; structural typing accepts  */
/* them. Same Firebase-authenticated request() mechanism as everything  */
/* above — no second client, no new auth logic.                         */
/* ------------------------------------------------------------------ */

export interface OwnerPropertyItem {
  id: number;
  property_type: string;
  /** Owner-defined place identity. Null for legacy unnamed properties. */
  name: string | null;
  address_line: string;
  locality: string | null;
  city: string | null;
  area_location_id: number | null;
  area_location: {
    id: number;
    type: string;
    name: string;
    city: string;
  } | null;
}

export interface OwnerUnitItem {
  id: number;
  property_id: number;
  unit_type: string;
  layout: string | null;
}

export interface OwnerPriceItem {
  charge_type: string;
  amount_paise: number | null;
  billing_frequency: string;
  calculation_basis: string;
}

export interface OwnerPhotoItem {
  id: number;
}

export interface OwnerListingItem {
  id: number;
  rental_unit_id: number;
  title: string;
  description: string | null;
  rent_basis: string;
  status: string;
  availability_status: string;
  available_from: string | null;
  price_components: OwnerPriceItem[];
  photos: OwnerPhotoItem[];
  created_at: string;
}

export const listOwnerProperties = (): Promise<OwnerPropertyItem[]> =>
  apiGet<OwnerPropertyItem[]>("/api/v1/owner/properties");

export const listPropertyUnits = (
  propertyId: number
): Promise<OwnerUnitItem[]> =>
  apiGet<OwnerUnitItem[]>(`/api/v1/owner/properties/${propertyId}/units`);

export const listOwnerListings = (): Promise<OwnerListingItem[]> =>
  apiGet<OwnerListingItem[]>("/api/v1/owner/listings");

export type LocationKind = "college" | "workplace" | "area";

export const listLocations = (
  type: LocationKind,
  search: string
): Promise<LocationItem[]> => {
  const params = new URLSearchParams({ type, limit: "10" });
  const q = search.trim();
  if (q) params.set("search", q);
  return request<LocationItem[]>(`/api/v1/locations?${params.toString()}`);
};
