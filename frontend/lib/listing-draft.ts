/**
 * Owner listing draft model (production).
 *
 * Shaped to map cleanly onto the finalized backend domain when API
 * integration lands:
 *
 *   place  -> Property      (buildingType/INDEPENDENT_HOUSE mapping documented below)
 *   space  -> RentalUnit    (kind -> unit_type/occupancy/capacity/layout mapping below)
 *   (later phases: Listing -> Pricing -> Photos)
 *
 * Only the fields needed by the first three wizard chapters exist here.
 * Later chapters extend these interfaces; nothing here needs rewriting.
 */

import type { LocationItem, OwnerPropertyItem } from "@/lib/api";

/* ------------------------------------------------------------------ */
/* Rental kind (UX-level; mapped to backend unit fields at submit time) */
/* ------------------------------------------------------------------ */

/** Stable UX codes. Backend mapping (later phase, no API yet):
 *  single   -> unit_type PRIVATE_ROOM, occupancy SINGLE, capacity 1, sharing PRIVATE
 *  shared   -> SHARED_ROOM_BED, occupancy from beds (2 DOUBLE, 3 TRIPLE, 4+ QUAD_PLUS), sharing SHARED
 *  rk1..bhk4plus -> ENTIRE_FLAT + layout "1 RK".."4 BHK+", capacity/sharing NULL
 *  pg_bed   -> PG_BED, occupancy SINGLE, capacity 1, sharing PRIVATE
 *  other    -> OTHER (+ detail text folded into listing description)
 */
export type RentalKind =
  | "single"
  | "shared"
  | "rk1"
  | "bhk1"
  | "bhk2"
  | "bhk3"
  | "bhk4plus"
  | "pg_bed"
  | "other";

export const RENTAL_KINDS: { value: RentalKind; title: string; body: string }[] = [
  { value: "single", title: "Single Room", body: "A private room for one person" },
  { value: "shared", title: "Shared Room", body: "A room shared with other people" },
  { value: "rk1", title: "1 RK", body: "One room with a kitchen" },
  { value: "bhk1", title: "1 BHK", body: "One bedroom, hall and kitchen" },
  { value: "bhk2", title: "2 BHK", body: "Two bedrooms, hall and kitchen" },
  { value: "bhk3", title: "3 BHK", body: "Three bedrooms, hall and kitchen" },
  { value: "bhk4plus", title: "4 BHK+", body: "Four or more bedrooms" },
  { value: "pg_bed", title: "Bed in PG / Hostel", body: "A single bed in shared accommodation" },
  { value: "other", title: "Something else", body: "Tell us what you're renting" },
];

export const WHOLE_HOME_KINDS: RentalKind[] = ["rk1", "bhk1", "bhk2", "bhk3", "bhk4plus"];

export function isWholeHomeKind(kind: RentalKind | ""): boolean {
  return (WHOLE_HOME_KINDS as string[]).includes(kind);
}

export function needsBeds(kind: RentalKind | ""): boolean {
  return kind === "shared";
}

export type Furnishing = "Unfurnished" | "Semi-furnished" | "Fully furnished";

export const FURNISHINGS: { value: Furnishing; title: string; body: string }[] = [
  { value: "Unfurnished", title: "Unfurnished", body: "No furniture" },
  { value: "Semi-furnished", title: "Semi-furnished", body: "Bed, wardrobe and the basics" },
  { value: "Fully furnished", title: "Fully furnished", body: "Move in with just a bag" },
];

export type Audience = "Anyone" | "Men" | "Women";

/** Backend `RentalUnit.food_status` values. Null = unspecified. */
export type FoodStatus = "included" | "separate" | "none";

/** House-rule policies. Null = not specified (never a default). */
export interface PolicyDraft {
  couples: boolean | null;
  visitors: boolean | null;
  pets: boolean | null;
  smoking: boolean | null;
  alcohol: boolean | null;
}

export const POLICY_ROWS: { key: keyof PolicyDraft; label: string; hint?: string }[] = [
  { key: "couples", label: "Are couples allowed?" },
  { key: "visitors", label: "Can renters have visitors?", hint: "Daytime guests, for example." },
  { key: "pets", label: "Are pets allowed?" },
  { key: "smoking", label: "Is smoking allowed?" },
  { key: "alcohol", label: "Is alcohol allowed?" },
];

/** Human-readable amenity labels (never backend slugs). */
export const AMENITIES: string[] = [
  "Wi-Fi",
  "AC",
  "Parking",
  "Power backup",
  "Laundry",
  "Food / mess",
  "Drinking water",
  "Security",
  "Attached bathroom",
  "Balcony",
  "Kitchen access",
  "CCTV",
  "Housekeeping",
];

export interface SpaceDraft {
  kind: RentalKind | "";
  /** Free text when kind === "other". Cleared when kind changes away. */
  detail: string;
  /** Beds for shared rooms (2/3/4/5 = 5+). Null when not applicable. */
  beds: number | null;
  /** Required: backend RentalUnit.furnishing is NOT NULL. */
  furnishing: Furnishing | "";
  /** Null = unspecified. Unit-level independence (not Property.is_independent). */
  independent: boolean | null;
  /** Whole-home bathrooms ("1"/"2"/"3+") or room stepper count ("0"-"6"), else "". */
  bathrooms: string;
  /** "Ground"/"1"/"2"/"3"/"4+"/"Don't know", else "". Toggle to clear. */
  floorNo: string;
  /** Digits only (max 5 chars), else "". */
  carpetArea: string;
  /** Free text (max 2000 chars), else "". Maps to house_rules (empty → null). */
  houseRules: string;
  /** Null = unspecified. Only asked for Anyone/Men/Women choice. */
  audience: Audience | "";
  policies: PolicyDraft;
  /** Human labels from AMENITIES; deduplicated by construction. */
  amenities: string[];
  /** "" = unspecified. Only asked for PG/Hostel buildings. */
  pgFood: FoodStatus | "";
  /** Null = unspecified. Only asked for PG/Hostel buildings. */
  pgCurfew: boolean | null;
}

/* ------------------------------------------------------------------ */
/* Building kind (stored as backend PropertyType enum values)          */
/* ------------------------------------------------------------------ */

/** Backend `Property.property_type` values. "Room in a house" is a UX
 *  concept that maps to internal INDEPENDENT_HOUSE + a room unit;
 *  "Assam-type house" maps to ASSAM_TYPE_HOUSE (P3). */
export type BuildingKind =
  | "PG"
  | "HOSTEL"
  | "APARTMENT_FLAT"
  | "INDEPENDENT_HOUSE"
  | "ASSAM_TYPE_HOUSE"
  | "OTHER";

export const BUILDING_KINDS: { value: BuildingKind; title: string; body: string }[] = [
  { value: "PG", title: "PG", body: "Paying guest accommodation" },
  { value: "HOSTEL", title: "Hostel", body: "Shared accommodation with rooms or beds" },
  { value: "APARTMENT_FLAT", title: "Apartment", body: "Flat in an apartment building" },
  { value: "INDEPENDENT_HOUSE", title: "Room in a house", body: "A room you're renting inside a house" },
  { value: "ASSAM_TYPE_HOUSE", title: "Assam-type house", body: "Traditional/local standalone house" },
  { value: "OTHER", title: "Other", body: "Tell us what it is" },
];

/* ------------------------------------------------------------------ */
/* Place (Property)                                                    */
/* ------------------------------------------------------------------ */

export interface PlaceDraft {
  buildingType: BuildingKind | "";
  /** Free text when buildingType === "OTHER". Cleared otherwise. */
  buildingOther: string;
  /**
   * Owner-defined human identity of the physical place ("Green View House").
   * Maps to backend Property.name. Deliberately NOT called `title` or
   * `name`: the draft also carries listing.title (the renter-facing offer
   * title) and the two must never be conflated or synchronized.
   */
  placeName: string;
  address: string;
  locality: string;
  /** Typed catalog selection (area). Never free text. */
  area: LocationItem | null;
  /** Owner-entered area name for areas missing from the catalog. Only
   *  used when area is null; a selected catalog area always wins. */
  areaCustomName: string;
  city: string;
  pincode: string;
  /** Typed catalog selections. Never free text. */
  college: LocationItem | null;
  workplace: LocationItem | null;
  /** Single gate-closing time, HH:MM. Only meaningful when curfew is Yes. */
  gateTime: string;
}

/* ------------------------------------------------------------------ */
/* Draft root                                                          */
/* ------------------------------------------------------------------ */

export type ChapterId =
  | "what"
  | "kind"
  | "chooseproperty"
  | "where"
  | "placename"
  | "space"
  | "included"
  | "who"
  | "photos"
  | "price"
  | "movein"
  | "name"
  | "preview"
  | "publish";

/* ------------------------------------------------------------------ */
/* Photos (local draft metadata — NOT backend READY records)           */
/* ------------------------------------------------------------------ */

/** Draft-local photo state. `src` is a downscaled data URL so the draft
 *  (including previews) survives refresh inside localStorage limits;
 *  session-only blob: URLs are dropped on load. `status` describes the
 *  local draft only — backend PENDING/READY comes later. */
export type PhotoStatus = "local";

export interface PhotoDraft {
  id: string;
  name: string;
  /** Downscaled data-URL preview, or null when unavailable. */
  src: string | null;
  status: PhotoStatus;
  cover: boolean;
  order: number;
}

/* ------------------------------------------------------------------ */
/* Pricing (local draft; maps to listing_price_components at submit)   */
/* ------------------------------------------------------------------ */

/** Backend mapping (later phase, no API yet):
 *  rent    -> charge_type RENT, billing MONTHLY, variability FIXED,
 *             mandatory true, included true, payment PER_PERIOD,
 *             amount_paise = rupees x 100 (integer math only).
 *  deposit -> charge_type DEPOSIT, billing ONE_TIME, FIXED,
 *             refundable true, payment ON_MOVE_IN, amount_paise.
 *             (C5 satisfied; C7 holds since timing != PER_PERIOD.)
 *  extras  -> charge_type KIND.toUpperCase(); frequency monthly/quarterly/
 *             yearly/once/metered -> MONTHLY/QUARTERLY/ANNUALLY/ONE_TIME with
 *             FIXED + amount_paise, or (metered) calculation CONSUMPTION +
 *             variability VARIABLE + rate_paise_per_unit + billing
 *             USAGE_BASED. mandatory/included map directly; refundable
 *             stays false (no UI toggle); payment defaults to PER_PERIOD
 *             for periodic rows and UPFRONT_FULL for ONE_TIME rows (C7).
 *             consumption_unit has no UI field: serializer must supply a
 *             per-kind default (e.g. electricity -> "kWh") to satisfy C2,
 *             which also requires rate + VARIABLE + USAGE_BASED/MONTHLY.
 *  rentBasis person/room/place -> listing.rent_basis PER_PERSON/PER_ROOM/
 *             PER_UNIT; the RENT row's calculation_basis must match (C6 +
 *             rent_basis consistency rule).
 *  Whole rupees in drafts; paise conversion (x100) happens at submit.
 */
export type RentBasis = "" | "person" | "room" | "place";
export type ExtraKind =
  | "food"
  | "maintenance"
  | "electricity"
  | "water"
  | "internet"
  | "other";

export const EXTRA_KINDS: { value: ExtraKind; title: string }[] = [
  { value: "food", title: "Food" },
  { value: "maintenance", title: "Maintenance" },
  { value: "electricity", title: "Electricity" },
  { value: "water", title: "Water" },
  { value: "internet", title: "Internet" },
  { value: "other", title: "Other" },
];

export type ExtraFrequency = "monthly" | "quarterly" | "yearly" | "once" | "metered";

export const EXTRA_FREQUENCIES: { value: ExtraFrequency; title: string }[] = [
  { value: "monthly", title: "Monthly" },
  { value: "quarterly", title: "Quarterly" },
  { value: "yearly", title: "Yearly" },
  { value: "once", title: "One-time" },
  { value: "metered", title: "As used" },
];

export interface ExtraChargeDraft {
  id: string;
  kind: ExtraKind;
  /** Required when kind === "other". */
  label: string;
  /** Whole rupees, digits only. Required unless metered. */
  amount: string;
  frequency: ExtraFrequency;
  /** True = per-unit rate instead of fixed amount (CONSUMPTION at submit). */
  metered: boolean;
  /** Whole rupees per unit, digits only. Required when metered. */
  rate: string;
  /** Everyone pays (true) vs optional add-on (false). Maps to mandatory. */
  mandatory: boolean;
  /** Shown inside the headline price (true) vs as an extra (false). */
  included: boolean;
}

export interface PricingDraft {
  /** Whole rupees, digits only. Required for a publishable listing. */
  rent: string;
  /** person/room selected by owner; place fixed for whole homes. "" = unset. */
  rentBasis: RentBasis;
  /** Whole rupees, digits only. Empty = no deposit. */
  deposit: string;
  extras: ExtraChargeDraft[];
}

/* ------------------------------------------------------------------ */
/* Availability (maps to listing availability_status at submit)        */
/* ------------------------------------------------------------------ */

export type AvailabilityMode = "now" | "from" | "occupied";

export interface AvailabilityDraft {
  mode: AvailabilityMode | "";
  /** yyyy-mm-dd. Only meaningful when mode === "from". */
  date: string;
}

/* ------------------------------------------------------------------ */
/* Listing identity (maps to backend Listing.title/description)       */
/* ------------------------------------------------------------------ */

export interface ListingIdentityDraft {
  /** Required (min 2 chars). Maps to Listing.title (NOT NULL). */
  title: string;
  /** Optional. Maps to Listing.description (nullable). */
  description: string;
}

/**
 * Local-only publish simulation. This is a UX preview state, NOT a
 * backend lifecycle state — no API call backs it. "live" means "this is
 * how publishing will feel", never "renters can see this".
 */
export type LocalPublishState = "none" | "live" | "paused";

/**
 * Backend ids created by the submit flow. Persisted in the draft so a
 * retry or a reopened draft resumes from the first missing resource
 * instead of creating duplicates. All null until submitted.
 */
export interface BackendIds {
  propertyId: number | null;
  unitId: number | null;
  listingId: number | null;
}

/**
 * Accept only real backend resource ids: positive integers. Everything
 * else from storage (0, negatives, fractionals, strings, null,
 * undefined, NaN) normalizes to null so a malformed draft can never skip
 * creation steps with a bogus id.
 */
export function normalizeBackendId(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null;
}

/**
 * Completion markers for the id-tied submit steps (price components and
 * availability attach to the listing — no separate backend ids exist for
 * them). Persisted in the draft so retries skip completed steps instead
 * of re-sending them.
 */
export interface SubmitProgress {
  price: boolean;
  availability: boolean;
}

/**
 * Structural equality for draft slices. UI patches are built by spreading
 * the current slice, so key order is stable; any value change is always
 * detected. A false negative would be a stale-submission bug, while a
 * false positive merely resubmits an idempotent step — so plain JSON
 * comparison is the safe choice here.
 */
export function draftSliceEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Centralized submit-progress invalidation. The draft store calls this
 * from updateDraft — the single funnel for every UI mutation — so no
 * control needs its own reset logic: editing pricing clears only `price`,
 * editing availability clears only `availability`, and unrelated (or
 * value-identical) patches preserve both. Never invents completion.
 */
export function nextSubmitProgress(
  existing: Pick<
    ListingDraft,
    "pricing" | "availability" | "submitProgress" | "backendIds"
  >,
  patch: Partial<
    Pick<
      ListingDraft,
      "pricing" | "availability" | "submitProgress" | "backendIds"
    >
  >
): SubmitProgress {
  const current: SubmitProgress = existing.submitProgress ?? {
    price: false,
    availability: false,
  };
  let progress = current;
  if (
    patch.pricing !== undefined &&
    !draftSliceEqual(existing.pricing, patch.pricing)
  ) {
    progress = { ...progress, price: false };
  }
  if (
    patch.availability !== undefined &&
    !draftSliceEqual(existing.availability, patch.availability)
  ) {
    progress = { ...progress, availability: false };
  }
  if (
    patch.backendIds !== undefined &&
    normalizeBackendId(patch.backendIds.propertyId) !==
      normalizeBackendId(existing.backendIds?.propertyId)
  ) {
    // Switching properties orphans any unit/listing submitted under the old
    // one: force both id-tied steps to resubmit. Callers also clear the
    // dependent unit/listing ids; this is the backstop.
    progress = { price: false, availability: false };
  }
  return progress;
}

/**
 * Where the draft's property comes from. `"new"` (default) means this flow
 * creates the Property; `"existing"` means the owner picked one of their
 * current properties and the flow must reuse its id. Authoritative — never
 * inferred from backendIds.propertyId, which is also set when this flow
 * itself created the property during an earlier submission attempt.
 */
export type PropertySource = "new" | "existing";

export interface ListingDraft {
  id: string;
  status: "draft";
  updatedAt: number;
  currentChapter: ChapterId;
  furthestChapter: ChapterId;
  propertySource: PropertySource;
  space: SpaceDraft;
  place: PlaceDraft;
  photos: PhotoDraft[];
  pricing: PricingDraft;
  availability: AvailabilityDraft;
  listing: ListingIdentityDraft;
  localPublish: LocalPublishState;
  backendIds: BackendIds;
  submitProgress: SubmitProgress;
}

export const CHAPTERS: { id: ChapterId; title: string }[] = [
  { id: "what", title: "What are you renting?" },
  { id: "kind", title: "What kind of place is it?" },
  { id: "chooseproperty", title: "Choose a property" },
  { id: "where", title: "Where is it?" },
  { id: "placename", title: "What do you call this place?" },
  { id: "space", title: "Tell us about the space" },
  { id: "included", title: "What's included?" },
  { id: "who", title: "Who can stay?" },
  { id: "photos", title: "Show the place" },
  { id: "price", title: "How much?" },
  { id: "movein", title: "When can someone move in?" },
  { id: "name", title: "Name your listing" },
  { id: "preview", title: "Preview" },
  { id: "publish", title: "Publish" },
];

/** Chapters with real screens. Name/preview/publish land in Phase 4D. */
export const IMPLEMENTED_CHAPTERS: ChapterId[] = [
  "what",
  "kind",
  "chooseproperty",
  "where",
  "placename",
  "space",
  "included",
  "who",
  "photos",
  "price",
  "movein",
  "name",
  "preview",
  "publish",
];

/** Next *implemented* chapter, or null when the flow ends for now. */
export function nextImplementedChapter(id: ChapterId): ChapterId | null {
  const order = CHAPTERS.map((c) => c.id).filter((c) =>
    (IMPLEMENTED_CHAPTERS as string[]).includes(c)
  );
  const next = order[order.indexOf(id) + 1];
  return next ?? null;
}

/**
 * SINGLE source of truth for chapter ordering. All navigation
 * (next/prev/jump-clamp/furthest/progress) derives from here.
 */
export function chapterIndex(id: ChapterId): number {
  return CHAPTERS.findIndex((c) => c.id === id);
}

export function nextChapter(id: ChapterId): ChapterId | null {
  const next = CHAPTERS[chapterIndex(id) + 1];
  return next ? next.id : null;
}

export function prevChapter(id: ChapterId): ChapterId | null {
  const prev = CHAPTERS[chapterIndex(id) - 1];
  return prev ? prev.id : null;
}

/** Clamp a jump target so users never skip past their furthest chapter. */
export function clampChapter(target: ChapterId, furthest: ChapterId): ChapterId {
  const clamped = Math.min(Math.max(0, chapterIndex(target)), Math.max(0, chapterIndex(furthest)));
  return CHAPTERS[clamped]?.id ?? "what";
}

export function emptyDraft(id: string): ListingDraft {
  return {
    id,
    status: "draft",
    updatedAt: Date.now(),
    currentChapter: "what",
    furthestChapter: "what",
    propertySource: "new",
    space: {
      kind: "",
      detail: "",
      beds: null,
      furnishing: "",
      independent: null,
      bathrooms: "",
      floorNo: "",
      carpetArea: "",
      houseRules: "",
      audience: "",
      policies: { couples: null, visitors: null, pets: null, smoking: null, alcohol: null },
      amenities: [],
      pgFood: "",
      pgCurfew: null,
    },
    place: {
      buildingType: "",
      buildingOther: "",
      placeName: "",
      address: "",
      locality: "",
      area: null,
      areaCustomName: "",
      city: "Guwahati",
      pincode: "",
      college: null,
      workplace: null,
      gateTime: "",
    },
    photos: [],
    pricing: { rent: "", rentBasis: "", deposit: "", extras: [] },
    availability: { mode: "", date: "" },
    listing: { title: "", description: "" },
    localPublish: "none",
    backendIds: { propertyId: null, unitId: null, listingId: null },
    submitProgress: { price: false, availability: false },
  };
}

/* ------------------------------------------------------------------ */
/* Money helpers (whole rupees in drafts; paise only at submit)        */
/* ------------------------------------------------------------------ */

/** Parse typed rupees to an integer, or null when empty/invalid. */
export function parseRupees(v: string): number | null {
  const digits = v.replace(/[^0-9]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  return n;
}

/** Display formatting: 10500 -> "₹10,500". No floating point involved. */
export function inr(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

/** Convert whole rupees to paise with integer math only. */
export function rupeesToPaise(rupees: number): number {
  return rupees * 100;
}

/* ------------------------------------------------------------------ */
/* Validation (client-side UX only; backend remains authoritative)     */
/* ------------------------------------------------------------------ */

export function validateWhat(space: SpaceDraft): string | null {
  if (!space.kind) return "Choose what you're renting — the next questions adapt to it.";
  if (space.kind === "shared" && space.beds === null)
    return "How many beds are in this room? Pick one below.";
  if (space.kind === "other" && space.detail.trim().length < 2)
    return "Tell us what you're renting in a few words.";
  return null;
}

export function validateKind(place: PlaceDraft): string | null {
  if (!place.buildingType) return "Pick the closest match — you can refine it later.";
  if (place.buildingType === "OTHER" && place.buildingOther.trim().length < 2)
    return "Tell us what kind of place it is.";
  return null;
}

export function validateSpace(space: SpaceDraft): string | null {
  if (!space.furnishing) return "How furnished is it? Renters filter by this.";
  return null;
}

export function validateWho(space: SpaceDraft, place: PlaceDraft): string | null {
  if (!space.audience) return "Who is this place for? Pick one — you can change it later.";
  const isPg = place.buildingType === "PG" || place.buildingType === "HOSTEL";
  if (isPg && space.pgCurfew === true && !place.gateTime)
    return "What time does the gate close?";
  return null;
}

export function validatePhotos(photos: PhotoDraft[]): string | null {
  if (photos.length === 0) return null; // optional for now; publish needs 3+
  if (photos.length > 15) return "15 photos is the maximum — remove one to add another.";
  return null;
}

export function validatePrice(pricing: PricingDraft): string | null {
  if (parseRupees(pricing.rent) === null)
    return "Add a monthly rent before continuing.";
  if (pricing.deposit.trim() && parseRupees(pricing.deposit) === null)
    return "That deposit doesn't look right — whole rupees only.";
  const seen = new Set<string>();
  for (const row of pricing.extras) {
    if (row.kind === "other" && row.label.trim().length < 2)
      return "Name your “Other” charge so renters know what it is.";
    if (row.metered) {
      if (parseRupees(row.rate) === null)
        return "Add the per-unit rate for the metered charge.";
    } else if (parseRupees(row.amount) === null) {
      return "Fill the amount on every extra charge.";
    }
    const key = `${row.kind}|${row.frequency}`;
    if (seen.has(key)) return "Two rows describe the same charge — keep just one.";
    seen.add(key);
  }
  return null;
}

export function validateName(listing: ListingIdentityDraft): string | null {
  if (listing.title.trim().length < 2)
    return "Give your place a name — even two words will do.";
  if (listing.title.trim().length > 200)
    return "Keep the name under 200 characters.";
  return null;
}

/** Suggest a headline from answers so far. Owner-editable, never stored silently. */
export function suggestTitle(d: {
  space: SpaceDraft;
  place: Pick<PlaceDraft, "area" | "areaCustomName" | "locality" | "college">;
}): string {
  const areaName =
    d.place.area?.name.trim() || d.place.areaCustomName.trim() || "";
  const near =
    d.place.college?.name.trim() || areaName || d.place.locality.trim();
  const where = near ? ` near ${near}` : "";
  const furn = d.space.furnishing ? `${d.space.furnishing} ` : "";
  if (isWholeHomeKind(d.space.kind)) {
    const layout: Record<string, string> = {
      rk1: "1 RK",
      bhk1: "1 BHK",
      bhk2: "2 BHK",
      bhk3: "3 BHK",
      bhk4plus: "4 BHK+",
    };
    const label = layout[d.space.kind] ?? "";
    if (label) return `${furn}${label}${where}`.trim();
  }
  switch (d.space.kind) {
    case "single":
      return `Single room${where}`;
    case "shared":
      return `Shared room${where}`;
    case "pg_bed":
      return `PG bed${where}`;
    case "other":
      return `${d.space.detail.trim() || "Room for rent"}${where}`;
    default:
      return `Place for rent${where}`;
  }
}

export interface ReadinessItem {
  key: "photos" | "rent" | "location" | "availability" | "details";
  ok: boolean;
  label: string;
  detail: string;
  step: ChapterId;
}

/** Frontend readiness preview. NOT a backend publish gate: local photos
 *  are draft state, never backend READY records. */
export function readiness(d: ListingDraft): ReadinessItem[] {
  const localPhotos = d.photos.length;
  const rent = parseRupees(d.pricing.rent);
  const placeOk =
    d.place.address.trim().length > 0 &&
    d.place.city.trim().length > 0 &&
    (d.place.area !== null || d.place.areaCustomName.trim() !== "");
  const availOk =
    d.availability.mode === "now" ||
    (d.availability.mode === "from" && d.availability.date.length > 0);
  const titleOk = d.listing.title.trim().length >= 2;
  return [
    {
      key: "photos",
      ok: localPhotos >= 3,
      label: "Photos",
      detail:
        localPhotos >= 3
          ? `${localPhotos} added (final check happens at publish)`
          : `Add ${3 - localPhotos} more photo${localPhotos === 2 ? "" : "s"}`,
      step: "photos",
    },
    {
      key: "rent",
      ok: rent !== null,
      label: "Rent",
      detail: rent !== null ? `${inr(rent)} / month` : "Not set yet",
      step: "price",
    },
    {
      key: "location",
      ok: placeOk,
      label: "Location",
      detail: placeOk
        ? d.place.area?.name.trim() ||
          d.place.areaCustomName.trim() ||
          "Set"
        : "Area missing",
      step: "where",
    },
    {
      key: "availability",
      ok: availOk,
      label: "Availability",
      detail:
        d.availability.mode === "occupied"
          ? "Currently full — switch to publish"
          : availOk
            ? "Ready"
            : "Not set yet",
      step: "movein",
    },
    {
      key: "details",
      ok: titleOk,
      label: "Details",
      detail: titleOk ? "Name set" : "Name your listing",
      step: "name",
    },
  ];
}

export function allReady(d: ListingDraft): boolean {
  return readiness(d).every((r) => r.ok);
}

/** Cover-first gallery order for preview. */
export function effectiveCoverId(d: ListingDraft): string | null {
  const ordered = [...d.photos].sort((a, b) => a.order - b.order);
  if (ordered.length === 0) return null;
  return ordered.find((p) => p.cover)?.id ?? ordered[0].id;
}

export function availabilityLine(d: ListingDraft): string {
  if (d.availability.mode === "now") return "Ready now";
  if (d.availability.mode === "from" && d.availability.date)
    return `Available from ${d.availability.date}`;
  if (d.availability.mode === "occupied") return "Currently full";
  return "Availability not set";
}

export function validateMoveIn(availability: AvailabilityDraft): string | null {
  if (!availability.mode) return "Tell renters when they can move in.";
  if (availability.mode === "from") {
    if (!availability.date) return "Pick the first move-in date.";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (new Date(`${availability.date}T00:00:00`) < today)
      return "That date has passed — pick today or later.";
  }
  return null;
}

export function validateWhere(place: PlaceDraft): string | null {
  if (!place.area && !place.areaCustomName.trim())
    return "Choose the area where your property is located.";
  if (place.address.trim().length < 5)
    return "Add the house number, street and a landmark.";
  if (!place.city.trim()) return "City is needed — Guwahati is filled in for you.";
  if (place.pincode.trim() && !/^[1-9][0-9]{5}$/.test(place.pincode.trim()))
    return "That pincode doesn't look right — 6 digits, e.g. 781028.";
  return null;
}

/**
 * The choose-property gate: "new" always passes (Where/placename collect
 * the data); "existing" requires a stored property id. Never infers the
 * source from backendIds — see PropertySource.
 */
export function validateChooseProperty(draft: Pick<ListingDraft, "propertySource" | "backendIds">): string | null {
  if (draft.propertySource === "existing" && normalizeBackendId(draft.backendIds?.propertyId) === null)
    return "Choose one of your properties, or create a new one.";
  return null;
}

/**
 * Complete place replacement from a selected existing property. Returns a
 * FULL PlaceDraft (callers overwrite, never merge) so no stale address,
 * name, type, or area survives a switch. Unknown backend types fall back
 * to OTHER with the raw type preserved as detail, keeping validation
 * green without inventing data.
 */
export function prefillPlaceFromProperty(item: OwnerPropertyItem): PlaceDraft {
  const knownTypes: BuildingKind[] = ["PG", "HOSTEL", "APARTMENT_FLAT", "INDEPENDENT_HOUSE", "ASSAM_TYPE_HOUSE"];
  const buildingType: BuildingKind = (knownTypes as string[]).includes(item.property_type)
    ? (item.property_type as BuildingKind)
    : "OTHER";
  return {
    buildingType,
    // Unknown backend types fall back to OTHER with an empty detail: the
    // raw enum must never leak into renter-facing listing text via the
    // buildingOther fold-in. The owner then answers Kind explicitly, which
    // keeps validation honest without inventing data.
    buildingOther: "",
    placeName: item.name ?? "",
    address: item.address_line,
    locality: item.locality ?? "",
    area: item.area_location
      ? { id: item.area_location.id, type: "area", name: item.area_location.name, city: item.area_location.city }
      : null,
    areaCustomName: item.area_custom_name ?? "",
    city: item.city ?? "",
    pincode: item.pincode ?? "",
    // Nearby-college/workplace answers belong to this listing flow, not the
    // property: a fresh selection starts unanswered rather than inheriting
    // another listing's context.
    college: null,
    workplace: null,
    gateTime: "",
  };
}

/**
 * Owner-defined place identity ("Green View House"). Any readable text works —
 * no pattern restriction. Distinct from validateName (the renter-facing
 * listing title); the two are never merged or synchronized.
 */
export function validatePlaceName(place: Pick<PlaceDraft, "placeName">): string | null {
  const name = place.placeName.trim();
  // No minimum beyond non-blank (matches backend Property.name): even a
  // single character is a legitimate name.
  if (name.length < 1)
    return "Give this place a name so you can recognize it — e.g. Green View House.";
  if (name.length > 120)
    return "Keep the place name under 120 characters.";
  return null;
}

/* ------------------------------------------------------------------ */
/* Per-user localStorage persistence (mirrors onboarding-storage.ts)   */
/* ------------------------------------------------------------------ */

function draftsKeyFor(uid: string): string {
  return `owner-listing-drafts:${uid}`;
}

export function loadDrafts(uid: string): Record<string, ListingDraft> {
  if (!uid || typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(draftsKeyFor(uid));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ListingDraft>;
    if (!parsed || typeof parsed !== "object") return {};
    // Merge over defaults so older stored drafts gain new fields safely.
    const out: Record<string, ListingDraft> = {};
    for (const [id, d] of Object.entries(parsed)) {
      if (!d || typeof d !== "object") continue;
      const fresh = emptyDraft(id);
      out[id] = {
        ...fresh,
        ...d,
        // Pre-feature drafts lack propertySource; corrupt values fall back
        // to "new" (today's behavior) rather than a locked path.
        propertySource:
          (d as ListingDraft).propertySource === "existing" ? "existing" : "new",
        space: {
          ...fresh.space,
          ...(d.space ?? {}),
          policies: { ...fresh.space.policies, ...((d.space as SpaceDraft | undefined)?.policies ?? {}) },
          amenities: Array.isArray((d.space as SpaceDraft | undefined)?.amenities)
            ? [...new Set((d.space as SpaceDraft).amenities)]
            : [],
        },
        place: { ...fresh.place, ...(d.place ?? {}) },
        // Session-only blob: URLs die on refresh — drop those tiles so
        // stale previews never pretend to be usable photos. Downscaled
        // data URLs persist, so order/cover/images survive refresh.
        photos: Array.isArray((d as ListingDraft).photos)
          ? (d as ListingDraft).photos
              .filter((p) => p && typeof p === "object" && !(p.src ?? "").startsWith("blob:"))
              .map((p, i) => ({ ...p, status: "local" as const, order: i }))
          : [],
        pricing: {
          ...fresh.pricing,
          ...((d as ListingDraft).pricing ?? {}),
          // Older stored extra rows predate metered/rate/mandatory/included.
          extras: Array.isArray((d as ListingDraft).pricing?.extras)
            ? (d as ListingDraft).pricing.extras
                .filter((row) => row && typeof row === "object")
                .map((row) => ({
                  ...row,
                  label: row.label ?? "",
                  amount: row.amount ?? "",
                  frequency: row.frequency ?? ("monthly" as const),
                  metered: row.metered ?? false,
                  rate: row.rate ?? "",
                  mandatory: row.mandatory ?? true,
                  included: row.included ?? true,
                }))
            : [],
        },
        availability: { ...fresh.availability, ...((d as ListingDraft).availability ?? {}) },
        listing: { ...fresh.listing, ...((d as ListingDraft).listing ?? {}) },
        localPublish:
          (d as ListingDraft).localPublish === "live" ||
          (d as ListingDraft).localPublish === "paused"
            ? (d as ListingDraft).localPublish
            : "none",
        backendIds: {
          propertyId: normalizeBackendId(
            (d as ListingDraft).backendIds?.propertyId
          ),
          unitId: normalizeBackendId((d as ListingDraft).backendIds?.unitId),
          listingId: normalizeBackendId(
            (d as ListingDraft).backendIds?.listingId
          ),
        },
        submitProgress: {
          price: (d as ListingDraft).submitProgress?.price === true,
          availability: (d as ListingDraft).submitProgress?.availability === true,
        },
      };
    }
    return out;
  } catch {
    return {};
  }
}

export function saveDrafts(uid: string, drafts: Record<string, ListingDraft>): void {
  if (!uid || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(draftsKeyFor(uid), JSON.stringify(drafts));
  } catch {
    // Storage full/blocked: drafts simply don't persist. Never crash the flow.
  }
}

export function newDraftId(): string {
  return `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
