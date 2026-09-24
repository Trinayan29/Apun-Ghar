/**
 * ListingDraft -> backend payload serializer (production).
 *
 * Pure mapping layer, no network calls. Converts the owner-facing draft
 * into payloads accepted by the existing FastAPI owner endpoints:
 *
 *   serializeProperty(draft)  -> POST /api/v1/owner/properties
 *   serializeUnit(draft)      -> POST /api/v1/owner/properties/{id}/units
 *   serializeListing(draft, rentalUnitId)
 *                             -> POST /api/v1/owner/listings
 *   serializePriceComponents(draft)
 *                             -> PUT  /api/v1/owner/listings/{id}/price-components
 *   planPhotoUploads(draft)   -> metadata plan for the future
 *                                photos:init -> upload bytes -> photos:confirm
 *                                lifecycle (no network here)
 *
 * Creation order at submit time: property -> unit -> listing ->
 * price components -> photos -> publish. Each step needs the id
 * returned by the previous one, so orchestration (later phase) calls
 * these in order; this module only builds payloads.
 *
 * Conventions shared by every serializer below:
 * - Blank strings become null (backend treats "" and null differently;
 *   e.g. blank titles/descriptions are rejected, blank optionals are null).
 * - Whole rupees become paise with integer math only (x100).
 * - Human UX labels are mapped to backend enums; see per-field notes.
 * - Validation errors are the wizard's job (validate* in listing-draft);
 *   serializers assume a validated draft but stay total (never throw).
 */

import {
  isWholeHomeKind,
  parseRupees,
  rupeesToPaise,
  type AvailabilityDraft,
  type ExtraChargeDraft,
  type ListingDraft,
  type PricingDraft,
  type SpaceDraft,
} from "./listing-draft";

/* ------------------------------------------------------------------ */
/* Shared value mappings                                               */
/* ------------------------------------------------------------------ */

/** "3+" -> 3 (documented minimum-value approximation, not an exact
 *  count). Plain digits parse as-is. Anything else -> null. */
export function mapBathrooms(v: string): number | null {
  const t = v.trim();
  if (t === "3+") return 3;
  if (!/^[0-9]+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

/** "Ground" -> 0. "4+" -> 4 (documented minimum-value approximation).
 *  "Don't know"/blank -> null. Plain digits parse as-is. */
export function mapFloorNo(v: string): number | null {
  const t = v.trim();
  if (t === "" || t === "Don't know") return null;
  if (t === "Ground") return 0;
  if (t === "4+") return 4;
  if (!/^[0-9]+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

/** Digits -> int. Blank and "0" -> null (backend requires sqft > 0,
 *  so a zero reading means "not provided", never 0). */
export function mapCarpetArea(v: string): number | null {
  const n = parseRupees(v);
  return n;
}

export type RentBasisBackend = "PER_PERSON" | "PER_ROOM" | "PER_UNIT";

export function mapRentBasis(basis: PricingDraft["rentBasis"]): RentBasisBackend {
  if (basis === "room") return "PER_ROOM";
  if (basis === "place") return "PER_UNIT";
  return "PER_PERSON";
}

export function mapAudience(
  audience: SpaceDraft["audience"]
): "ANY" | "MALE" | "FEMALE" {
  if (audience === "Men") return "MALE";
  if (audience === "Women") return "FEMALE";
  return "ANY";
}

export function mapFurnishing(
  furnishing: SpaceDraft["furnishing"]
): "UNFURNISHED" | "SEMI_FURNISHED" | "FURNISHED" | null {
  if (furnishing === "Unfurnished") return "UNFURNISHED";
  if (furnishing === "Semi-furnished") return "SEMI_FURNISHED";
  if (furnishing === "Fully furnished") return "FURNISHED";
  return null;
}

/**
 * Human amenity label -> catalog slug. Slugs are the stable canonical
 * identity (backend seeds key on slug), but the unit endpoints accept only
 * numeric `amenity_ids` — so slugs must be resolved against a catalog
 * fetched from the backend (see resolveAmenityIds). There is currently no
 * catalog endpoint, so 4E-1 creates the unit without amenities and reports
 * the owner's selections as pending (see describeAmenities); a later phase
 * attaches them via PATCH once a catalog source exists.
 */
export function mapAmenityToSlug(label: string): string | null {
  const table: Record<string, string> = {
    "Wi-Fi": "wifi",
    AC: "ac",
    Parking: "parking",
    "Power backup": "power-backup",
    Laundry: "laundry",
    "Food / mess": "food-mess",
    "Drinking water": "drinking-water",
    Security: "security-guard",
    "Attached bathroom": "attached-bath",
    Balcony: "balcony",
    "Kitchen access": "kitchen-access",
    CCTV: "cctv",
    Housekeeping: "housekeeping",
  };
  return table[label] ?? null;
}

/**
 * One backend amenity catalog row. Ids are database-generated (never
 * hardcoded here) — callers obtain these from a backend catalog source.
 */
export interface AmenityCatalogEntry {
  id: number;
  slug: string;
}

/**
 * Owner's selected amenities, split into resolvable slugs and labels with
 * no known slug. Deduped, first-seen order. Unknown labels are reported —
 * never silently dropped, never sent to the backend.
 */
export function describeAmenities(draft: ListingDraft): {
  slugs: string[];
  unknownLabels: string[];
} {
  const slugs: string[] = [];
  const unknownLabels: string[] = [];
  for (const label of new Set(draft.space.amenities)) {
    const slug = mapAmenityToSlug(label);
    if (slug === null) {
      unknownLabels.push(label);
    } else if (!slugs.includes(slug)) {
      slugs.push(slug);
    }
  }
  return { slugs, unknownLabels };
}

/**
 * Resolve catalog slugs to backend amenity ids using a caller-supplied
 * catalog. Never invents ids: slugs with no catalog entry land in
 * `missing`; catalog rows with non-positive-integer ids are treated as
 * missing too. Total (never throws).
 */
export function resolveAmenityIds(
  slugs: string[],
  catalog: AmenityCatalogEntry[]
): { ids: number[]; missing: string[] } {
  const bySlug = new Map<string, number>();
  for (const entry of catalog) {
    if (
      typeof entry?.slug === "string" &&
      Number.isInteger(entry?.id) &&
      (entry.id as number) > 0 &&
      !bySlug.has(entry.slug)
    ) {
      bySlug.set(entry.slug, entry.id);
    }
  }
  const ids: number[] = [];
  const missing: string[] = [];
  for (const slug of new Set(slugs)) {
    const id = bySlug.get(slug);
    if (id === undefined) {
      missing.push(slug);
    } else if (!ids.includes(id)) {
      ids.push(id);
    }
  }
  return { ids, missing };
}

/* ------------------------------------------------------------------ */
/* Property payload  (POST /api/v1/owner/properties)                   */
/* ------------------------------------------------------------------ */

export interface PropertyPayload {
  property_type: string;
  address_line: string;
  locality: string | null;
  area_location_id: number | null;
  city: string | null;
  pincode: string | null;
  gate_closing_time: string | null;
  has_curfew: boolean | null;
  is_independent: null;
  nearest_college_id: number | null;
  nearest_workplace_id: number | null;
}

export function serializeProperty(draft: ListingDraft): PropertyPayload {
  const place = draft.place;
  const isPg = place.buildingType === "PG" || place.buildingType === "HOSTEL";
  const hasCurfew = isPg ? draft.space.pgCurfew : null;
  return {
    property_type: place.buildingType,
    address_line: place.address.trim(),
    locality: place.locality.trim() || null,
    area_location_id: place.area?.id ?? null,
    city: place.city.trim() || null,
    pincode: place.pincode.trim() || null,
    // One gate-time source of truth: only a Yes curfew carries a time.
    // has_curfew=false forces null (backend 422s FALSE + time).
    gate_closing_time: hasCurfew === true ? place.gateTime.trim() || null : null,
    has_curfew: hasCurfew,
    // Building-level independence is out of scope for the owner UX;
    // unit-level independence lives on the rental unit instead.
    is_independent: null,
    nearest_college_id: place.college?.id ?? null,
    nearest_workplace_id: place.workplace?.id ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Rental-unit payload  (POST /api/v1/owner/properties/{id}/units)     */
/* ------------------------------------------------------------------ */

export interface RentalUnitPayload {
  unit_type: string;
  occupancy_type: string | null;
  capacity: number | null;
  sharing: string | null;
  layout: string | null;
  is_independent: boolean | null;
  food_status: string | null;
  furnishing: string | null;
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
  /**
   * Backend amenity ids. Present only when the caller supplies a catalog
   * (see resolveAmenityIds); omitted otherwise so the unit is created
   * amenity-free and the selections stay pending in the draft instead of
   * being sent under a key the backend rejects (extra="forbid").
   */
  amenity_ids?: number[];
}

const LAYOUT_BY_KIND: Record<string, string> = {
  rk1: "1 RK",
  bhk1: "1 BHK",
  bhk2: "2 BHK",
  bhk3: "3 BHK",
  bhk4plus: "4 BHK+",
};

export function serializeUnit(
  draft: ListingDraft,
  catalog?: AmenityCatalogEntry[]
): RentalUnitPayload {
  const s = draft.space;
  const wholeHome = isWholeHomeKind(s.kind);

  let unit_type = "OTHER";
  let occupancy_type: string | null = null;
  let capacity: number | null = null;
  let sharing: string | null = null;
  let layout: string | null = null;

  if (s.kind === "single") {
    unit_type = "PRIVATE_ROOM";
    occupancy_type = "SINGLE";
    capacity = 1;
    sharing = "PRIVATE";
  } else if (s.kind === "shared") {
    unit_type = "SHARED_ROOM_BED";
    const beds = s.beds ?? 0;
    occupancy_type = beds <= 2 ? "DOUBLE" : beds === 3 ? "TRIPLE" : "QUAD_PLUS";
    capacity = beds > 0 ? beds : null;
    sharing = "SHARED";
  } else if (s.kind === "pg_bed") {
    unit_type = "PG_BED";
    occupancy_type = "SINGLE";
    capacity = 1;
    sharing = "PRIVATE";
  } else if (wholeHome) {
    // Whole-home: NULL occupancy/capacity/sharing ("not applicable").
    // Never fake capacity=1/sharing=PRIVATE to satisfy old constraints.
    unit_type = "ENTIRE_FLAT";
    layout = LAYOUT_BY_KIND[s.kind] ?? null;
  } else {
    unit_type = "OTHER";
  }

  // Amenities need backend ids, which only a catalog source can supply.
  // Without one the key is omitted (unit created amenity-free, selections
  // stay pending via describeAmenities) — never sent as slugs.
  const amenity_ids =
    catalog === undefined
      ? undefined
      : resolveAmenityIds(describeAmenities(draft).slugs, catalog).ids;

  return {
    unit_type,
    occupancy_type,
    capacity,
    sharing,
    layout,
    ...(amenity_ids === undefined ? {} : { amenity_ids }),
    is_independent: s.independent,
    food_status:
      s.pgFood === ""
        ? null
        : s.pgFood === "included"
          ? "INCLUDED"
          : s.pgFood === "separate"
            ? "SEPARATE"
            : "NONE",
    furnishing: mapFurnishing(s.furnishing),
    gender_scope: mapAudience(s.audience),
    bathrooms: mapBathrooms(s.bathrooms),
    floor_number: mapFloorNo(s.floorNo),
    carpet_area_sqft: mapCarpetArea(s.carpetArea),
    couple_friendly: s.policies.couples,
    visitors_allowed: s.policies.visitors,
    pets_allowed: s.policies.pets,
    smoking_allowed: s.policies.smoking,
    alcohol_allowed: s.policies.alcohol,
    house_rules: s.houseRules.trim() || null,
  };
}

/* ------------------------------------------------------------------ */
/* Listing payload  (POST /api/v1/owner/listings)                      */
/* ------------------------------------------------------------------ */

export interface ListingPayload {
  rental_unit_id: number;
  title: string;
  description: string | null;
  rent_basis: RentBasisBackend;
  availability_status: "AVAILABLE_NOW" | "AVAILABLE_FROM_DATE" | "OCCUPIED";
  available_from: string | null;
}

export function serializeListing(
  draft: ListingDraft,
  rentalUnitId: number
): ListingPayload {
  // Free-text overflow folds into the description: there is deliberately
  // no backend field for buildingOther/whatDetail.
  const extraBits = [
    draft.space.kind === "other" ? draft.space.detail.trim() : "",
    draft.place.buildingType === "OTHER" ? draft.place.buildingOther.trim() : "",
  ].filter(Boolean);
  const descriptionParts = [
    draft.listing.description.trim(),
    ...extraBits,
  ].filter(Boolean);
  return {
    rental_unit_id: rentalUnitId,
    title: draft.listing.title.trim(),
    description: descriptionParts.length > 0 ? descriptionParts.join("\n\n") : null,
    rent_basis: mapRentBasis(draft.pricing.rentBasis),
    availability_status:
      draft.availability.mode === "from"
        ? "AVAILABLE_FROM_DATE"
        : draft.availability.mode === "occupied"
          ? "OCCUPIED"
          : "AVAILABLE_NOW",
    available_from:
      draft.availability.mode === "from" ? draft.availability.date || null : null,
  };
}

/* ------------------------------------------------------------------ */
/* Price components  (PUT /api/v1/owner/listings/{id}/price-components)*/
/* ------------------------------------------------------------------ */

export interface PriceComponentPayload {
  charge_type: string;
  label: string | null;
  calculation_basis: string;
  billing_frequency: string;
  variability: "FIXED" | "VARIABLE";
  amount_paise: number | null;
  rate_paise_per_unit: number | null;
  consumption_unit: string | null;
  mandatory: boolean;
  included_in_advertised: boolean;
  refundable: boolean;
  payment_timing: string;
  display_order: number;
}

/** Per-kind consumption units for metered rows. Backend C2 requires a
 *  non-null consumption_unit alongside rate + VARIABLE + USAGE_BASED
 *  (or MONTHLY) billing. There is no UI field for this, so the
 *  serializer supplies explicit per-kind defaults (integration may
 *  refine the wording; the values must simply be non-blank). */
export const CONSUMPTION_UNIT_BY_KIND: Record<string, string> = {
  electricity: "kWh",
  water: "kilolitre",
  food: "meal",
  maintenance: "unit",
  internet: "GB",
  other: "unit",
};

const FREQUENCY_TO_BILLING: Record<string, string> = {
  monthly: "MONTHLY",
  quarterly: "QUARTERLY",
  yearly: "ANNUALLY",
  once: "ONE_TIME",
  metered: "USAGE_BASED",
};

function extraKindToCharge(kind: ExtraChargeDraft["kind"]): string {
  return kind.toUpperCase();
}

export function serializePriceComponents(draft: ListingDraft): PriceComponentPayload[] {
  const rentBasis = mapRentBasis(draft.pricing.rentBasis);
  const rows: PriceComponentPayload[] = [];
  let displayOrder = 0;

  const rent = parseRupees(draft.pricing.rent);
  if (rent !== null) {
    rows.push({
      charge_type: "RENT",
      label: null,
      // C6 + rent_basis consistency: the RENT row matches the listing basis.
      calculation_basis: rentBasis,
      billing_frequency: "MONTHLY",
      variability: "FIXED",
      amount_paise: rupeesToPaise(rent),
      rate_paise_per_unit: null,
      consumption_unit: null,
      mandatory: true,
      included_in_advertised: true,
      refundable: false,
      payment_timing: "PER_PERIOD",
      display_order: displayOrder++,
    });
  }

  const deposit = parseRupees(draft.pricing.deposit);
  if (deposit !== null) {
    rows.push({
      charge_type: "DEPOSIT",
      label: null,
      // C5 constrains billing/variability/refundable/amount/timing, not
      // the basis: inherit the listing basis for one coherent basis.
      calculation_basis: rentBasis,
      billing_frequency: "ONE_TIME",
      variability: "FIXED",
      amount_paise: rupeesToPaise(deposit),
      rate_paise_per_unit: null,
      consumption_unit: null,
      mandatory: true,
      included_in_advertised: false,
      refundable: true,
      // C7 forbids ONE_TIME + PER_PERIOD.
      payment_timing: "UPFRONT_FULL",
      display_order: displayOrder++,
    });
  }

  for (const row of draft.pricing.extras) {
    if (row.metered) {
      const rate = parseRupees(row.rate);
      if (rate === null) continue;
      rows.push({
        charge_type: extraKindToCharge(row.kind),
        label: row.kind === "other" ? row.label.trim() || null : null,
        calculation_basis: "CONSUMPTION",
        billing_frequency: "USAGE_BASED",
        variability: "VARIABLE",
        amount_paise: null,
        rate_paise_per_unit: rupeesToPaise(rate),
        consumption_unit: CONSUMPTION_UNIT_BY_KIND[row.kind] ?? "unit",
        mandatory: row.mandatory,
        included_in_advertised: row.included,
        refundable: false,
        payment_timing: "PER_PERIOD",
        display_order: displayOrder++,
      });
      continue;
    }
    const amount = parseRupees(row.amount);
    if (amount === null) continue;
    const billing =
      row.frequency === "monthly"
        ? "MONTHLY"
        : row.frequency === "quarterly"
          ? "QUARTERLY"
          : row.frequency === "yearly"
            ? "ANNUALLY"
            : "ONE_TIME";
    rows.push({
      charge_type: extraKindToCharge(row.kind),
      label: row.kind === "other" ? row.label.trim() || null : null,
      // Non-metered extras inherit the listing basis (no UI field for this).
      calculation_basis: rentBasis,
      billing_frequency: billing,
      variability: "FIXED",
      amount_paise: rupeesToPaise(amount),
      rate_paise_per_unit: null,
      consumption_unit: null,
      mandatory: row.mandatory,
      included_in_advertised: row.included,
      refundable: false,
      // C7 forbids ONE_TIME + PER_PERIOD.
      payment_timing: billing === "ONE_TIME" ? "UPFRONT_FULL" : "PER_PERIOD",
      display_order: displayOrder++,
    });
  }

  return rows;
}

/* ------------------------------------------------------------------ */
/* Availability payload  (POST /api/v1/owner/listings/{id}/availability)*/
/* ------------------------------------------------------------------ */

export interface AvailabilityPayload {
  availability_status: "AVAILABLE_NOW" | "AVAILABLE_FROM_DATE" | "OCCUPIED";
  available_from: string | null;
}

export function serializeAvailability(
  availability: AvailabilityDraft
): AvailabilityPayload {
  if (availability.mode === "from") {
    return {
      availability_status: "AVAILABLE_FROM_DATE",
      available_from: availability.date || null,
    };
  }
  if (availability.mode === "occupied") {
    return { availability_status: "OCCUPIED", available_from: null };
  }
  return { availability_status: "AVAILABLE_NOW", available_from: null };
}

/* ------------------------------------------------------------------ */
/* Photo upload plan (NO network — metadata ordering only)             */
/* ------------------------------------------------------------------ */

export interface PhotoUploadPlanItem {
  /** Draft-local id, for correlating init -> upload -> confirm later. */
  localId: string;
  /** Display order for photos:init (cover first). */
  displayOrder: number;
  /** Cover flag for photos:init/confirm. */
  isCover: boolean;
}

/**
 * Orders local draft photos for the future init -> upload-bytes ->
 * confirm lifecycle. Local data-URL previews are NEVER sent as
 * storage keys and NEVER presented as backend READY records; the
 * integration phase will upload bytes first and use server-issued
 * storage_key values in photos:init.
 */
export function planPhotoUploads(
  photos: { id: string; cover: boolean; order: number }[]
): PhotoUploadPlanItem[] {
  return [...photos]
    .sort((a, b) => {
      const aCover = a.cover ? 0 : 1;
      const bCover = b.cover ? 0 : 1;
      return aCover - bCover || a.order - b.order;
    })
    .map((p, i) => ({ localId: p.id, displayOrder: i, isCover: i === 0 }));
}
