/**
 * P2.3b Edit Listing save serializers + guards. Pure and side-effect
 * free: converts (current draft + savedSnapshot) into exact backend
 * mutation payloads for the future P2.3c orchestrator.
 *
 * It must NOT fetch, call apiPatch/apiPut/apiPost, or touch
 * localStorage/React state. It never mutates either input.
 *
 * Semantics per resource (from the P2.3a contract audit):
 * - omitted key = unchanged (PATCH-style resources)
 * - explicit null = clear, only where the backend column is nullable
 * - pricing PUT is FULL REPLACEMENT: when sent, the complete intended
 *   component set is built (never a single changed row)
 * - availability mode "" means NO mutation (never default AVAILABLE_NOW)
 * - transformations reuse listing-submit.ts (serializeUnit,
 *   serializeProperty, serializePriceComponents, serializeAvailability,
 *   map* helpers) instead of duplicating mapping logic
 */

import {
  mapRentBasis,
  serializeAvailability,
  serializePriceComponents,
  serializeProperty,
  serializeUnit,
  type AvailabilityPayload,
  type PriceComponentPayload,
  type RentBasisBackend,
} from "./listing-submit";
import type {
  AvailabilityDraft,
  ListingDraft,
  RentBasis,
} from "./listing-draft";

/* ------------------------------------------------------------------ */
/* Validation issues (pre-save, user-facing, no backend internals)      */
/* ------------------------------------------------------------------ */

export interface SaveIssue {
  /** Draft-relative path, e.g. "pricing.rent". */
  field: string;
  message: string;
}

function issue(field: string, message: string): SaveIssue {
  return { field, message };
}

/* ------------------------------------------------------------------ */
/* Resource plans                                                       */
/* ------------------------------------------------------------------ */

export interface ResourcePlan<B> {
  /** False = nothing changed (or blocked); the orchestrator skips the call. */
  send: boolean;
  /** Exact request body. Only meaningful when send is true. */
  body: B;
  /** Pre-save problems found while serializing this slice. */
  issues: SaveIssue[];
}

function clean<B>(send: boolean, body: B): ResourcePlan<B> {
  return { send, body, issues: [] };
}

function blocked<B>(body: B, issues: SaveIssue[]): ResourcePlan<B> {
  return { send: false, body, issues };
}

/* ------------------------------------------------------------------ */
/* Shared guards                                                        */
/* ------------------------------------------------------------------ */

/** Whole-rupee canonical money: digits only. "" means unset (allowed). */
const CANONICAL_MONEY = /^[0-9]+$/;

function canonicalMoney(
  raw: string,
  field: string,
  label: string
): SaveIssue | null {
  const t = raw.trim();
  if (t === "") return null;
  if (!CANONICAL_MONEY.test(t))
    return issue(field, `${label} must be a whole number of rupees.`);
  return null;
}

const GATE_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const PINCODE_RE = /^[1-9][0-9]{5}$/;

const SERVER_BASES: RentBasisBackend[] = ["PER_PERSON", "PER_ROOM", "PER_UNIT"];

const DRAFT_BASIS_BY_SERVER: Record<RentBasisBackend, RentBasis> = {
  PER_PERSON: "person",
  PER_ROOM: "room",
  PER_UNIT: "place",
};

/* ------------------------------------------------------------------ */
/* Save context (server state the pure layer cannot see)                */
/* ------------------------------------------------------------------ */

export interface SaveContext {
  /** Current listing lifecycle, e.g. "PUBLISHED" (for the OCCUPIED rule). */
  listingStatus: string;
  /** Current listing.rent_basis (PUT validates against it; PATCH may move it). */
  rentBasis: string;
}

/* ------------------------------------------------------------------ */
/* Property PATCH                                                       */
/* ------------------------------------------------------------------ */

export interface PropertyPatchBody {
  property_type?: string;
  address_line?: string;
  name?: string | null;
  locality?: string | null;
  area_location_id?: number | null;
  area_custom_name?: string | null;
  city?: string;
  pincode?: string | null;
  gate_closing_time?: string | null;
  has_curfew?: boolean | null;
  nearest_college_id?: number | null;
  nearest_workplace_id?: number | null;
}

/** Backend-accepted Property PATCH keys. Tests assert bodies stay within this set. */
export const PROPERTY_KEYS = [
  "property_type",
  "address_line",
  "name",
  "locality",
  "area_location_id",
  "area_custom_name",
  "city",
  "pincode",
  "gate_closing_time",
  "has_curfew",
  "nearest_college_id",
  "nearest_workplace_id",
] as const;

/**
 * PATCH body with only changed fields. Derived by running both sides
 * through the create-side transform and diffing the results, so mapping
 * rules (canonical-wins area, curfew pair, blank-to-null) stay identical
 * to creation. Non-nullable address/city can never be nulled: a blank
 * change is a validation issue, not a null send.
 */
export function serializePropertyPatch(
  draft: ListingDraft,
  snapshot: ListingDraft
): ResourcePlan<PropertyPatchBody> {
  const next = serializeProperty(draft);
  const prev = serializeProperty(snapshot);
  const body: PropertyPatchBody = {};
  const issues: SaveIssue[] = [];

  if (next.property_type !== prev.property_type) {
    if (next.property_type === "") {
      issues.push(
        issue("place.buildingType", "Choose what kind of place this is.")
      );
    } else {
      body.property_type = next.property_type;
    }
  }
  if (next.address_line !== prev.address_line) {
    if (next.address_line === "") {
      issues.push(issue("place.address", "Add the house number and street."));
    } else {
      body.address_line = next.address_line;
    }
  }
  if (next.name !== prev.name) body.name = next.name;
  if (next.locality !== prev.locality) body.locality = next.locality;
  if (
    next.area_location_id !== prev.area_location_id ||
    next.area_custom_name !== prev.area_custom_name
  ) {
    // Pin the exact representation: never rely on the backend's silent
    // canonical-wins clear for display truth.
    body.area_location_id = next.area_location_id;
    body.area_custom_name = next.area_custom_name;
  }
  if (next.city !== prev.city) {
    if (next.city === "" || next.city === null) {
      issues.push(issue("place.city", "City is needed."));
    } else {
      body.city = next.city;
    }
  }
  if (next.pincode !== prev.pincode) {
    if (
      next.pincode !== null &&
      next.pincode !== "" &&
      !PINCODE_RE.test(next.pincode)
    ) {
      issues.push(
        issue("place.pincode", "That pincode doesn't look right — 6 digits.")
      );
    } else {
      body.pincode = next.pincode === "" ? null : next.pincode;
    }
  }
  if (
    next.has_curfew !== prev.has_curfew ||
    next.gate_closing_time !== prev.gate_closing_time
  ) {
    if (
      next.gate_closing_time !== null &&
      !GATE_TIME_RE.test(next.gate_closing_time)
    ) {
      issues.push(
        issue("place.gateTime", "Pick a valid gate-closing time.")
      );
    } else {
      body.has_curfew = next.has_curfew;
      body.gate_closing_time = next.gate_closing_time;
    }
  }
  if (next.nearest_college_id !== prev.nearest_college_id)
    body.nearest_college_id = next.nearest_college_id;
  if (next.nearest_workplace_id !== prev.nearest_workplace_id)
    body.nearest_workplace_id = next.nearest_workplace_id;

  if (issues.length > 0) return blocked(body, issues);
  return clean(Object.keys(body).length > 0, body);
}

/* ------------------------------------------------------------------ */
/* Rental unit PATCH                                                    */
/* ------------------------------------------------------------------ */

export interface UnitPatchBody {
  unit_type?: string;
  occupancy_type?: string | null;
  capacity?: number | null;
  sharing?: string | null;
  layout?: string | null;
  is_independent?: boolean | null;
  food_status?: string | null;
  furnishing?: string;
  gender_scope?: string;
  bathrooms?: number | null;
  floor_number?: number | null;
  carpet_area_sqft?: number | null;
  couple_friendly?: boolean | null;
  visitors_allowed?: boolean | null;
  pets_allowed?: boolean | null;
  smoking_allowed?: boolean | null;
  alcohol_allowed?: boolean | null;
  house_rules?: string | null;
}

/** Composition tuple: always sent together, never partially. */
export const COMPOSITION_KEYS = [
  "unit_type",
  "occupancy_type",
  "capacity",
  "sharing",
  "layout",
] as const;

/**
 * PATCH body with only changed fields, except composition: when any of
 * the five composition fields differs, the backend validates the MERGED
 * tuple, so the complete tuple (with explicit nulls) is always sent
 * together. amenity_ids is never sent (no catalog); property/listing
 * ids and lifecycle never appear.
 */
export function serializeUnitPatch(
  draft: ListingDraft,
  snapshot: ListingDraft
): ResourcePlan<UnitPatchBody> {
  // No catalog source: amenity_ids key is absent, never invented.
  const next = serializeUnit(draft);
  const prev = serializeUnit(snapshot);
  const body: UnitPatchBody = {};
  const issues: SaveIssue[] = [];

  const compositionChanged = COMPOSITION_KEYS.some(
    (k) => next[k] !== prev[k]
  );
  if (compositionChanged) {
    if (draft.space.kind === "shared" && draft.space.beds === null) {
      issues.push(
        issue("space.beds", "How many beds are in this room? Pick one.")
      );
    } else {
      body.unit_type = next.unit_type;
      body.occupancy_type = next.occupancy_type;
      body.capacity = next.capacity;
      body.sharing = next.sharing;
      body.layout = next.layout;
    }
  }

  if (next.is_independent !== prev.is_independent)
    body.is_independent = next.is_independent;
  if (next.food_status !== prev.food_status)
    body.food_status = next.food_status;
  // Non-nullable backend columns: an unspecified value omits the key
  // (sending null would 422). Upstream submit validation requires real
  // answers before any save runs.
  if (next.furnishing !== prev.furnishing && next.furnishing !== null)
    body.furnishing = next.furnishing;
  if (next.gender_scope !== prev.gender_scope) {
    if (draft.space.audience !== "") body.gender_scope = next.gender_scope;
  }
  if (next.bathrooms !== prev.bathrooms) body.bathrooms = next.bathrooms;
  if (next.floor_number !== prev.floor_number)
    body.floor_number = next.floor_number;
  if (next.carpet_area_sqft !== prev.carpet_area_sqft)
    body.carpet_area_sqft = next.carpet_area_sqft;
  (
    [
      "couple_friendly",
      "visitors_allowed",
      "pets_allowed",
      "smoking_allowed",
      "alcohol_allowed",
    ] as const
  ).forEach((k) => {
    if (next[k] !== prev[k]) body[k] = next[k];
  });
  if (next.house_rules !== prev.house_rules)
    body.house_rules = next.house_rules;

  if (issues.length > 0) return blocked(body, issues);
  return clean(Object.keys(body).length > 0, body);
}

/* ------------------------------------------------------------------ */
/* Listing PATCH                                                        */
/* ------------------------------------------------------------------ */

export interface ListingPatchBody {
  title?: string;
  description?: string | null;
  rent_basis?: RentBasisBackend;
}

/**
 * Fold free-text overflow into the description, exactly like creation:
 * "other" rental detail and OTHER building detail ride along. Appends a
 * bit only when it is not already the whole text or an exact "\n\n"
 * suffix — so saving twice, retrying, or reloading never double-appends.
 */
export function foldDescription(
  description: string,
  bits: string[]
): string | null {
  let out = description.trim();
  for (const raw of bits) {
    const bit = raw.trim();
    if (bit === "") continue;
    if (out === bit || out.endsWith(`\n\n${bit}`)) continue;
    out = out === "" ? bit : `${out}\n\n${bit}`;
  }
  return out === "" ? null : out;
}

function listingExtras(draft: ListingDraft): string[] {
  return [
    draft.space.kind === "other" ? draft.space.detail : "",
    draft.place.buildingType === "OTHER" ? draft.place.buildingOther : "",
  ];
}

export function serializeListingPatch(
  draft: ListingDraft,
  snapshot: ListingDraft
): ResourcePlan<ListingPatchBody> {
  const body: ListingPatchBody = {};
  const issues: SaveIssue[] = [];

  const nextTitle = draft.listing.title.trim();
  if (nextTitle !== snapshot.listing.title.trim()) {
    if (nextTitle.length < 2) {
      issues.push(
        issue("listing.title", "Give your place a name — even two words.")
      );
    } else {
      body.title = nextTitle;
    }
  }

  const nextDescription = foldDescription(
    draft.listing.description,
    listingExtras(draft)
  );
  const prevDescription = foldDescription(
    snapshot.listing.description,
    listingExtras(snapshot)
  );
  if (nextDescription !== prevDescription) body.description = nextDescription;

  if (issues.length > 0) return blocked(body, issues);
  return clean(Object.keys(body).length > 0, body);
}

/** Draft rent basis without create-time defaults: "" stays unset. */
function draftBasisOf(draft: ListingDraft): RentBasisBackend | null {
  if (draft.pricing.rentBasis === "") return null;
  return mapRentBasis(draft.pricing.rentBasis);
}

/* ------------------------------------------------------------------ */
/* Pricing (full-replacement PUT plan)                                  */
/* ------------------------------------------------------------------ */

function extraMoneyIssues(draft: ListingDraft): SaveIssue[] {
  const issues: SaveIssue[] = [];
  draft.pricing.extras.forEach((row, i) => {
    const field = `pricing.extras[${i}].${row.metered ? "rate" : "amount"}`;
    const problem = canonicalMoney(
      row.metered ? row.rate : row.amount,
      field,
      "Extra charge amounts"
    );
    if (problem) issues.push(problem);
    if (row.kind === "other" && row.label.trim() === "") {
      issues.push(
        issue(
          `pricing.extras[${i}].label`,
          "Name your “Other” charge so renters know what it is."
        )
      );
    }
  });
  return issues;
}

/**
 * Whether the full price-component set must be replaced. Compares the
 * complete intended sets (never a single row — PUT deletes whatever is
 * omitted). Guards whole-rupee canonical money across the ENTIRE draft
 * set whenever a PUT would fire, so an untouched fractional-paise value
 * can never be corrupted as a side effect; untouched fractional data
 * with no other pricing change produces no PUT at all.
 */
export function planPricing(
  draft: ListingDraft,
  snapshot: ListingDraft,
  serverBasis: RentBasisBackend
): ResourcePlan<PriceComponentPayload[]> {
  const withBasis = (d: ListingDraft): ListingDraft => {
    const basis = d.pricing.rentBasis === "" ? DRAFT_BASIS_BY_SERVER[serverBasis] : d.pricing.rentBasis;
    return { ...d, pricing: { ...d.pricing, rentBasis: basis } };
  };
  const next = serializePriceComponents(withBasis(draft));
  const prev = serializePriceComponents(withBasis(snapshot));
  // Structural extra validity first: the row serializer silently skips
  // unserializable extras, so an invalid extra could otherwise produce
  // an identical set and vanish without any error. (Snapshot extras are
  // server-valid by construction, so this only ever fires on real input.)
  const extraIssues = extraMoneyIssues(draft);
  if (extraIssues.length > 0) return blocked([], extraIssues);
  if (JSON.stringify(next) === JSON.stringify(prev))
    return clean(false, []);
  const issues: SaveIssue[] = [];
  const rentProblem = canonicalMoney(draft.pricing.rent, "pricing.rent", "Rent");
  if (rentProblem) issues.push(rentProblem);
  const depositProblem = canonicalMoney(
    draft.pricing.deposit,
    "pricing.deposit",
    "Deposit"
  );
  if (depositProblem) issues.push(depositProblem);
  if (issues.length > 0) return blocked([], issues);
  return clean(true, next);
}

/* ------------------------------------------------------------------ */
/* Availability plan                                                    */
/* ------------------------------------------------------------------ */

function isValidDateString(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  );
}

function todayLocal(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function availabilityIssues(
  availability: AvailabilityDraft,
  listingStatus: string
): SaveIssue[] {
  if (availability.mode === "") return [];
  if (availability.mode === "from") {
    if (availability.date.trim() === "")
      return [issue("availability.date", "Pick the first move-in date.")];
    if (!isValidDateString(availability.date.trim()))
      return [issue("availability.date", "Pick a valid move-in date.")];
    if (availability.date.trim() < todayLocal())
      return [issue("availability.date", "That date has passed — pick today or later.")];
    return [];
  }
  if (availability.mode === "occupied" && listingStatus === "PUBLISHED") {
    return [
      issue(
        "availability.mode",
        "A published listing can't be marked as full — pause it instead."
      ),
    ];
  }
  return [];
}

/**
 * Availability POST plan. Mode "" means NO mutation (create-time
 * AVAILABLE_NOW defaulting must never leak into edit saves).
 */
export function planAvailability(
  draft: ListingDraft,
  snapshot: ListingDraft,
  listingStatus: string
): ResourcePlan<AvailabilityPayload> {
  if (draft.availability.mode === "") return clean(false, serializeAvailability(snapshot.availability));
  const issues = availabilityIssues(draft.availability, listingStatus);
  if (issues.length > 0)
    return blocked(serializeAvailability(draft.availability), issues);
  const next = serializeAvailability(draft.availability);
  const prev = serializeAvailability(snapshot.availability);
  if (JSON.stringify(next) === JSON.stringify(prev))
    return clean(false, prev);
  return clean(true, next);
}

/* ------------------------------------------------------------------ */
/* Aggregate save plan (P2.3c input)                                     */
/* ------------------------------------------------------------------ */

export interface SavePlan {
  property: ResourcePlan<PropertyPatchBody>;
  unit: ResourcePlan<UnitPatchBody>;
  listing: ResourcePlan<ListingPatchBody>;
  /** True when the draft basis differs from the server basis: the
   *  orchestrator must run PUT([]) -> Listing PATCH -> PUT(full). */
  rentBasisChanged: boolean;
  /** When true with a changed basis, this is the basis to PATCH to. */
  rentBasis: RentBasisBackend | null;
  pricing: ResourcePlan<PriceComponentPayload[]>;
  availability: ResourcePlan<AvailabilityPayload>;
  /** Every issue across all slices. The orchestrator must not call
   *  any mutation endpoint while this is non-empty. */
  issues: SaveIssue[];
}

/**
 * Pure aggregate plan for one save attempt. No I/O. Server-known facts
 * the draft cannot see (lifecycle, current rent_basis) arrive via ctx.
 */
export function planSave(
  draft: ListingDraft,
  snapshot: ListingDraft,
  ctx: SaveContext
): SavePlan {
  const issues: SaveIssue[] = [];
  if (!SERVER_BASES.includes(ctx.rentBasis as RentBasisBackend)) {
    const blockedPlan: SavePlan = {
      property: blocked({}, []),
      unit: blocked({}, []),
      listing: blocked({}, []),
      rentBasisChanged: false,
      rentBasis: null,
      pricing: blocked([], []),
      availability: blocked(serializeAvailability(snapshot.availability), []),
      issues: [
        issue(
          "listing",
          "Couldn't read the saved listing — reload and try again."
        ),
      ],
    };
    return blockedPlan;
  }
  const serverBasis = ctx.rentBasis as RentBasisBackend;

  const property = serializePropertyPatch(draft, snapshot);
  const unit = serializeUnitPatch(draft, snapshot);
  const listing = serializeListingPatch(draft, snapshot);

  const draftBasis = draftBasisOf(draft);
  const rentBasisChanged = draftBasis !== null && draftBasis !== serverBasis;
  const rentBasis = rentBasisChanged ? draftBasis : null;
  if (rentBasisChanged && rentBasis !== null) {
    // Plan-level composition (serializeListingPatch stays server-free):
    // attach the new basis to the listing PATCH body.
    listing.body.rent_basis = rentBasis;
    if (!listing.send) listing.send = true;
  }

  const pricing = planPricing(draft, snapshot, serverBasis);
  const availability = planAvailability(
    draft,
    snapshot,
    ctx.listingStatus
  );

  issues.push(
    ...property.issues,
    ...unit.issues,
    ...listing.issues,
    ...pricing.issues,
    ...availability.issues
  );
  return {
    property,
    unit,
    listing,
    rentBasisChanged,
    rentBasis,
    pricing,
    availability,
    issues,
  };
}
