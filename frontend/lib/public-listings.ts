import { apiGet } from "./api";

/* ------------------------------------------------------------------ */
/* Public marketplace API types                                         */
/* ------------------------------------------------------------------ */

export interface PublicProperty {
  name: string | null;
  property_type: string;
  locality: string | null;
  city: string;
  area_name: string | null;
}

export interface PublicUnit {
  unit_type: string;
  layout: string | null;
  occupancy_type: string | null;
  capacity: number | null;
  sharing: string | null;
  furnishing: string;
  gender_scope: string;
  bathrooms: number | null;
  floor_number: number | null;
  carpet_area_sqft: number | null;
  couple_friendly: boolean | null;
  visitors_allowed: boolean | null;
  pets_allowed: boolean | null;
  smoking_allowed: boolean | null;
  alcohol_allowed: boolean | null;
  house_rules: string | null;
  amenities: string[];
}

export interface PublicPhoto {
  id: number;
  display_order: number;
  is_cover: boolean;
  view_url: string | null;
}

export interface PublicPriceComponent {
  id: number;
  charge_type: string;
  label: string | null;
  calculation_basis: string;
  billing_frequency: string;
  variability: string;
  amount_paise: number | null;
  rate_paise_per_unit: number | null;
  consumption_unit: string | null;
  mandatory: boolean;
  included_in_advertised: boolean;
  refundable: boolean;
  payment_timing: string;
  display_order: number;
}

interface PublicListingBase {
  id: number;
  title: string;
  description: string | null;
  rent_basis: string;
  status: "PUBLISHED";
  availability_status: string;
  available_from: string | null;
  monthly_total_paise: number | null;
  has_variable_charges: boolean;
  has_usage_charges: boolean;
  has_optional_charges: boolean;
  has_one_time_charges: boolean;
  property: PublicProperty;
  unit: PublicUnit;
}

export interface PublicListingSummary extends PublicListingBase {
  cover_photo: PublicPhoto | null;
  photo_count: number;
}

export interface PublicListingDetail extends PublicListingBase {
  price_components: PublicPriceComponent[];
  photos: PublicPhoto[];
}

export const PUBLIC_PROPERTY_TYPES = [
  "PG",
  "HOSTEL",
  "APARTMENT_FLAT",
  "INDEPENDENT_HOUSE",
  "ASSAM_TYPE_HOUSE",
  "STUDIO_BUILDING",
  "OTHER",
] as const;

export type PublicPropertyType = (typeof PUBLIC_PROPERTY_TYPES)[number];

export interface PublicListingFilters {
  maxMonthlyPaise?: number | null;
  propertyType?: PublicPropertyType | null;
  areaLocationId?: number | null;
  limit?: number;
  offset?: number;
}

/**
 * Highest offset the public list API accepts. Mirrors the backend's
 * `offset <= 10000` bound: offsets above it fail validation with 422.
 */
export const PUBLIC_MAX_OFFSET = 10000;

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer.`);
  }
}

/** Build `/api/v1/listings` query text. Invalid filter values throw. */
export function buildPublicListingsQuery(
  filters: PublicListingFilters = {}
): string {
  const limit = filters.limit ?? 20;
  const offset = filters.offset ?? 0;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
    throw new Error("limit must be an integer from 1 to 50.");
  }
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > PUBLIC_MAX_OFFSET
  ) {
    throw new Error(
      `offset must be an integer from 0 to ${PUBLIC_MAX_OFFSET}.`
    );
  }

  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (filters.maxMonthlyPaise !== undefined && filters.maxMonthlyPaise !== null) {
    if (
      !Number.isSafeInteger(filters.maxMonthlyPaise) ||
      filters.maxMonthlyPaise < 0
    ) {
      throw new Error("maxMonthlyPaise must be an integer zero or greater.");
    }
    params.set("max_monthly_paise", String(filters.maxMonthlyPaise));
  }
  if (filters.propertyType !== undefined && filters.propertyType !== null) {
    if (
      !(PUBLIC_PROPERTY_TYPES as readonly string[]).includes(
        filters.propertyType
      )
    ) {
      throw new Error("propertyType is not supported.");
    }
    params.set("property_type", filters.propertyType);
  }
  if (filters.areaLocationId !== undefined && filters.areaLocationId !== null) {
    assertPositiveInteger(filters.areaLocationId, "areaLocationId");
    params.set("area_location_id", String(filters.areaLocationId));
  }
  return params.toString();
}

/** Validate a dynamic-route listing ID before requesting it. */
export function parsePublicListingId(raw: string): number | null {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return id;
}

/**
 * Whether another page can be requested after a completed one.
 *
 * A starting offset of exactly PUBLIC_MAX_OFFSET is valid even when a
 * full page extends past it; paging then stops because the *next*
 * starting offset would exceed the supported window. This keeps the
 * client contract consistent with the backend `offset <= 10000` bound.
 */
export function publicListingsHasMore(args: {
  offset: number;
  limit: number;
  rows: number;
}): boolean {
  if (args.rows !== args.limit) return false;
  return args.offset + args.rows <= PUBLIC_MAX_OFFSET;
}

/** Public listing search. No login is required by the backend. */
export function listPublicListings(
  filters: PublicListingFilters = {}
): Promise<PublicListingSummary[]> {
  const query = buildPublicListingsQuery(filters);
  return apiGet<PublicListingSummary[]>(`/api/v1/listings?${query}`);
}

/** Public listing detail. Non-PUBLISHED and missing IDs return 404. */
export function getPublicListing(listingId: number): Promise<PublicListingDetail> {
  assertPositiveInteger(listingId, "listingId");
  return apiGet<PublicListingDetail>(`/api/v1/listings/${listingId}`);
}
