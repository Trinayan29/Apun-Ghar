/**
 * Edit Listing, Phase 1: load + hydrate only. No mutations.
 *
 * Entry is always an existing backend listing id. The loader performs
 * GET reads only (listing -> unit -> property); hydration maps the
 * authoritative rows onto the existing ListingDraft shape so the current
 * wizard chapters can render them. Nothing here POSTs, PATCHes, PUTs, or
 * DELETEs — a load failure closes the edit session instead of falling
 * back to CREATE mode (which could orphan or duplicate backend rows).
 */
import {
  getOwnerListing,
  getOwnerProperty,
  getOwnerUnit,
  ApiError,
  type OwnerListingItem,
  type OwnerPhotoItem,
  type OwnerPropertyItem,
} from "./api";
import {
  emptyDraft,
  prefillPlaceFromProperty,
  type AvailabilityDraft,
  type ExtraChargeDraft,
  type ExtraKind,
  type ListingDraft,
  type PhotoDraft,
  type PhotoStatus,
  type PricingDraft,
  type RentalKind,
  type SpaceDraft,
} from "./listing-draft";

/** Backend unit row with the full RentalUnitRead fields the API returns. */
export interface OwnerUnitDetail {
  id: number;
  property_id: number;
  unit_type: string;
  layout: string | null;
  occupancy_type?: string | null;
  capacity?: number | null;
  sharing?: string | null;
  is_independent?: boolean | null;
  food_status?: string | null;
  furnishing?: string | null;
  gender_scope?: string | null;
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

export interface EditSourceData {
  listing: OwnerListingItem;
  unit: OwnerUnitDetail;
  property: OwnerPropertyItem;
}

export type EditLoadErrorReason =
  | "invalid-id"
  | "not-found"
  | "forbidden"
  | "request-failed";

export class EditLoadError extends Error {
  reason: EditLoadErrorReason;
  constructor(reason: EditLoadErrorReason, message: string) {
    super(message);
    this.name = "EditLoadError";
    this.reason = reason;
  }
}

export interface EditLoaderDeps {
  getListing?: (id: number) => Promise<OwnerListingItem>;
  getUnit?: (id: number) => Promise<OwnerUnitDetail>;
  getProperty?: (id: number) => Promise<OwnerPropertyItem>;
}

function classifyLoadError(err: unknown, what: string): EditLoadError {
  if (err instanceof ApiError) {
    if (err.status === 404)
      return new EditLoadError("not-found", `${what} was not found.`);
    if (err.status === 401 || err.status === 403)
      return new EditLoadError(
        "forbidden",
        "You don't have access to this listing."
      );
    return new EditLoadError("request-failed", err.message);
  }
  return new EditLoadError(
    "request-failed",
    err instanceof Error ? err.message : "Couldn't load this listing."
  );
}

/**
 * Load the authoritative rows for an edit session. GETs only, strictly
 * listing -> unit -> property. Any failure throws EditLoadError — callers
 * must show an error state and must never fall back to CREATE mode.
 */
export async function loadEditSource(
  listingId: number,
  deps: EditLoaderDeps = {}
): Promise<EditSourceData> {
  if (!Number.isInteger(listingId) || listingId <= 0) {
    throw new EditLoadError("invalid-id", "That listing link looks broken.");
  }
  const getListing = deps.getListing ?? getOwnerListing;
  const getUnit =
    deps.getUnit ??
    (async (id: number) =>
      (await getOwnerUnit(id)) as unknown as OwnerUnitDetail);
  const getProperty = deps.getProperty ?? getOwnerProperty;

  let listing: OwnerListingItem;
  try {
    listing = await getListing(listingId);
  } catch (err) {
    throw classifyLoadError(err, "Listing");
  }
  if (
    !Number.isInteger(listing.rental_unit_id) ||
    listing.rental_unit_id <= 0
  ) {
    throw new EditLoadError(
      "not-found",
      "This listing is missing its room — it can't be edited."
    );
  }
  let unit: OwnerUnitDetail;
  try {
    unit = await getUnit(listing.rental_unit_id);
  } catch (err) {
    throw classifyLoadError(err, "Room");
  }
  if (!Number.isInteger(unit.property_id) || unit.property_id <= 0) {
    throw new EditLoadError(
      "not-found",
      "This listing is missing its property — it can't be edited."
    );
  }
  let property: OwnerPropertyItem;
  try {
    property = await getProperty(unit.property_id);
  } catch (err) {
    throw classifyLoadError(err, "Property");
  }
  return { listing, unit, property };
}

/* ------------------------------------------------------------------ */
/* Hydration (backend rows -> ListingDraft)                             */
/* ------------------------------------------------------------------ */

function paiseToRupeesText(amountPaise: number | null): string {
  if (amountPaise === null || amountPaise === undefined) return "";
  if (!Number.isSafeInteger(amountPaise) || amountPaise < 0) return "";
  // Whole rupees round-trip through parseRupees. Fractional paise cannot
  // round-trip (creation only allows whole rupees), so surface the exact
  // value and let validation flag it honestly rather than corrupting it.
  const whole = Math.trunc(amountPaise / 100);
  const rest = amountPaise % 100;
  if (rest === 0) return String(whole);
  return `${whole}.${String(rest).padStart(2, "0").replace(/0$/, "")}`;
}

function reverseKind(unitType: string, layout: string | null): RentalKind {
  if (unitType === "PRIVATE_ROOM") return "single";
  if (unitType === "SHARED_ROOM_BED") return "shared";
  if (unitType === "PG_BED") return "pg_bed";
  if (unitType === "ENTIRE_FLAT") {
    if (layout === "1 RK") return "rk1";
    if (layout === "1 BHK") return "bhk1";
    if (layout === "2 BHK") return "bhk2";
    if (layout === "3 BHK") return "bhk3";
    if (layout === "4 BHK+") return "bhk4plus";
  }
  // No exact match (ENTIRE_STUDIO, OTHER, unknown): fall back so the
  // wizard stays navigable for inspection; Phase 2 save must confirm.
  return "single";
}

function reverseBeds(
  capacity: number | null | undefined,
  occupancy: string | null | undefined
): number | null {
  if (typeof capacity === "number" && capacity >= 2 && capacity <= 5)
    return capacity;
  if (occupancy === "DOUBLE") return 2;
  if (occupancy === "TRIPLE") return 3;
  if (occupancy === "QUAD_PLUS") return 5;
  return null;
}

const EXTRA_KIND_BY_CHARGE: Record<string, ExtraKind> = {
  FOOD: "food",
  MAINTENANCE: "maintenance",
  ELECTRICITY: "electricity",
  WATER: "water",
  INTERNET: "internet",
  OTHER: "other",
};

const FREQUENCY_BY_BILLING: Record<
  string,
  "monthly" | "quarterly" | "yearly" | "once" | "metered"
> = {
  MONTHLY: "monthly",
  QUARTERLY: "quarterly",
  ANNUALLY: "yearly",
  ONE_TIME: "once",
  USAGE_BASED: "metered",
};

function hydratePricing(
  components: OwnerListingItem["price_components"]
): PricingDraft {
  const pricing: PricingDraft = { rent: "", rentBasis: "", deposit: "", extras: [] };
  let extraIndex = 0;
  for (const row of components) {
    if (row.charge_type === "RENT") {
      pricing.rent = paiseToRupeesText(row.amount_paise);
      pricing.rentBasis =
        row.calculation_basis === "PER_ROOM"
          ? "room"
          : row.calculation_basis === "PER_UNIT"
            ? "place"
            : row.calculation_basis === "PER_PERSON"
              ? "person"
              : "";
      continue;
    }
    if (row.charge_type === "DEPOSIT") {
      pricing.deposit = paiseToRupeesText(row.amount_paise);
      continue;
    }
    const kind = EXTRA_KIND_BY_CHARGE[row.charge_type];
    if (!kind) continue;
    const metered = row.calculation_basis === "CONSUMPTION";
    const extra: ExtraChargeDraft = {
      id: `extra-${extraIndex++}`,
      kind,
      // Preserve the owner's own label; the serializer sends it back only
      // for kind "other" (null otherwise), matching backend expectations.
      label:
        kind === "other"
          ? row.label?.trim() || "Other"
          : "",
      amount: metered ? "" : paiseToRupeesText(row.amount_paise),
      frequency: FREQUENCY_BY_BILLING[row.billing_frequency] ?? "monthly",
      metered,
      // Backend stores metered rates in rate_paise_per_unit (amount is
      // null by C1 XOR); fall back to amount only defensively.
      rate: metered
        ? paiseToRupeesText(row.rate_paise_per_unit ?? row.amount_paise)
        : "",
      mandatory: row.mandatory ?? true,
      included: row.included_in_advertised ?? true,
    };
    pricing.extras.push(extra);
  }
  return pricing;
}

function hydrateAvailability(
  listing: OwnerListingItem
): AvailabilityDraft {
  if (listing.availability_status === "AVAILABLE_FROM_DATE") {
    return { mode: "from", date: listing.available_from ?? "" };
  }
  if (listing.availability_status === "OCCUPIED") {
    return { mode: "occupied", date: "" };
  }
  return { mode: "now", date: "" };
}

function hydratePhotos(photos: OwnerPhotoItem[]): PhotoDraft[] {
  return [...photos]
    .sort((a, b) => a.display_order - b.display_order || a.id - b.id)
    .map((row, i) => {
      const ready = row.upload_status === "READY";
      return {
        id: `backend-${row.id}`,
        name: `Photo ${i + 1}`,
        src: null,
        status: (ready ? "ready" : "local") as PhotoStatus,
        cover: row.is_cover,
        order: i,
        backendId: ready ? row.id : null,
        viewUrl: ready ? (row.view_url ?? null) : null,
        error: null,
      };
    });
}

function hydrateSpace(unit: OwnerUnitDetail): SpaceDraft {
  const kind = reverseKind(unit.unit_type, unit.layout ?? null);
  const furnishing =
    unit.furnishing === "UNFURNISHED"
      ? "Unfurnished"
      : unit.furnishing === "SEMI_FURNISHED"
        ? "Semi-furnished"
        : unit.furnishing === "FURNISHED"
          ? "Fully furnished"
          : "";
  const audience =
    unit.gender_scope === "MALE"
      ? "Men"
      : unit.gender_scope === "FEMALE"
        ? "Women"
        : unit.gender_scope === "ANY"
          ? "Anyone"
          : "";
  return {
    kind,
    detail: "",
    beds: kind === "shared" ? reverseBeds(unit.capacity, unit.occupancy_type) : null,
    furnishing: furnishing as SpaceDraft["furnishing"],
    independent: unit.is_independent ?? null,
    pgFood:
      unit.food_status === "INCLUDED"
        ? "included"
        : unit.food_status === "SEPARATE"
          ? "separate"
          : unit.food_status === "NONE"
            ? "none"
            : "",
    // OwnerPropertyItem carries no curfew fields: leave unset rather than
    // inventing a value. Validation only requires gateTime when curfew is on.
    pgCurfew: null,
    audience: audience as SpaceDraft["audience"],
    policies: {
      couples: unit.couple_friendly ?? null,
      visitors: unit.visitors_allowed ?? null,
      pets: unit.pets_allowed ?? null,
      smoking: unit.smoking_allowed ?? null,
      alcohol: unit.alcohol_allowed ?? null,
    },
    amenities: [],
    bathrooms:
      typeof unit.bathrooms === "number" ? String(unit.bathrooms) : "",
    floorNo:
      unit.floor_number === 0
        ? "Ground"
        : typeof unit.floor_number === "number"
          ? String(unit.floor_number)
          : "Don't know",
    carpetArea:
      typeof unit.carpet_area_sqft === "number"
        ? String(unit.carpet_area_sqft)
        : "",
    houseRules: unit.house_rules ?? "",
  };
}

/**
 * Map authoritative backend rows onto a ListingDraft for inspection.
 * backendIds are fully populated (nothing will ever POST-create from an
 * edit draft in later phases); propertySource "existing" reuses the
 * locked-chapter display; furthestChapter unlocks every chapter so the
 * owner can inspect freely (Phase 1 performs no save).
 */
export function hydrateEditDraft(source: EditSourceData): ListingDraft {
  const { listing, unit, property } = source;
  const draft = emptyDraft(`edit-${listing.id}`);
  draft.backendIds = {
    propertyId: property.id,
    unitId: unit.id,
    listingId: listing.id,
  };
  draft.propertySource = "existing";
  draft.place = prefillPlaceFromProperty(property);
  draft.space = hydrateSpace(unit);
  draft.pricing = hydratePricing(listing.price_components);
  draft.availability = hydrateAvailability(listing);
  draft.listing = {
    title: listing.title,
    description: listing.description ?? "",
  };
  draft.photos = hydratePhotos(listing.photos);
  draft.submitProgress = {
    price: listing.price_components.some((c) => c.charge_type === "RENT"),
    availability: true,
  };
  draft.localPublish = "none";
  draft.currentChapter = "what";
  draft.furthestChapter = "publish";
  draft.updatedAt = Date.now();
  return draft;
}

/* ------------------------------------------------------------------ */
/* Edit-session storage (separate namespace from create drafts)         */
/* ------------------------------------------------------------------ */

export function editSessionKey(uid: string, listingId: number): string {
  return `owner-listing-edits:${uid}:${listingId}`;
}

/**
 * Meaningful editable slices for dirty comparison. Volatile fields
 * (timestamps, navigation, progress simulation, expiring view URLs,
 * transient upload errors) never count as edits.
 */
function comparableDraft(draft: ListingDraft): unknown {
  return {
    backendIds: draft.backendIds,
    propertySource: draft.propertySource,
    space: draft.space,
    place: draft.place,
    photos: draft.photos.map((p) => ({ ...p, viewUrl: null, error: null })),
    pricing: draft.pricing,
    availability: draft.availability,
    listing: draft.listing,
  };
}

/**
 * True when the working draft differs from its saved snapshot in any
 * meaningful slice. Reverting a field restores clean automatically —
 * dirtiness is derived, never a stored flag.
 */
export function editSessionDirty(session: EditSession): boolean {
  return (
    JSON.stringify(comparableDraft(session.draft)) !==
    JSON.stringify(comparableDraft(session.savedSnapshot))
  );
}

export interface ReconciledSession {
  session: EditSession;
  /** True when local edits were kept over a newer server state. */
  serverNewer: boolean;
}

/**
 * Pure refresh reconciliation (no I/O): no stored session → adopt the
 * fresh server state; stored-but-clean session → adopt the fresh server
 * state; stored-and-dirty session → keep local edits and flag that the
 * server has newer data (caller surfaces the banner; nothing merges).
 */
export function reconcileEditSession(
  stored: EditSession | null,
  fresh: ListingDraft
): ReconciledSession {
  if (stored === null || !editSessionDirty(stored)) {
    const adopted: EditSession = {
      draft: fresh,
      savedSnapshot: fresh,
      updatedAt: Date.now(),
    };
    return { session: adopted, serverNewer: false };
  }
  // Dirty locals are kept — but "server has newer data" is only true when
  // the fresh server state actually diverges from the saved snapshot. A
  // reload with an unchanged backend must not cry wolf (and must never
  // talk the owner into discarding real edits).
  const serverChanged =
    JSON.stringify(comparableDraft(fresh)) !==
    JSON.stringify(comparableDraft(stored.savedSnapshot));
  return { session: stored, serverNewer: serverChanged };
}

export interface EditSession {
  draft: ListingDraft;
  savedSnapshot: ListingDraft;
  updatedAt: number;
}

function isEditSession(value: unknown): value is EditSession {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.draft === "object" &&
    v.draft !== null &&
    typeof v.savedSnapshot === "object" &&
    v.savedSnapshot !== null &&
    typeof v.updatedAt === "number"
  );
}

export function loadEditSession(
  uid: string,
  listingId: number
): EditSession | null {
  if (!uid || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(editSessionKey(uid, listingId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isEditSession(parsed)) return null;
    // Never adopt a session whose ids drifted (wrong listing data would
    // be worse than reloading).
    if (parsed.draft.backendIds?.listingId !== listingId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveEditSession(
  uid: string,
  listingId: number,
  session: EditSession
): void {
  if (!uid || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      editSessionKey(uid, listingId),
      JSON.stringify(session)
    );
  } catch {
    // Storage pressure (e.g. data-URL previews) must never break editing.
  }
}
