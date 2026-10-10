/* Owner listing draft model (prototype-only, no backend coupling).
   Owner-friendly wording throughout — no DB terminology. */

export const STEP_KEYS = [
  "place",
  "space",
  "basics",
  "pricing",
  "photos",
  "availability",
  "preview",
] as const;

export type StepKey = (typeof STEP_KEYS)[number];

export const STEP_LABELS: Record<StepKey, string> = {
  place: "Place",
  space: "Space",
  basics: "Basics",
  pricing: "Pricing",
  photos: "Photos",
  availability: "Availability",
  preview: "Preview",
};

/* ---------- Place ---------- */

export type BuildingType =
  | "PG"
  | "Hostel"
  | "Apartment"
  | "Room in a house"
  | "Assam-type house"
  | "Other";

export const BUILDING_TYPES: BuildingType[] = [
  "PG",
  "Hostel",
  "Apartment",
  "Room in a house",
  "Assam-type house",
  "Other",
];

export interface PlaceState {
  buildingType: BuildingType | "";
  address: string;
  locality: string;
  area: string;
  city: string;
  pincode: string;
  gateTime: string;
  independent: boolean | null;
  nearCollege: string;
  nearWorkplace: string;
  floors: string;
  builtYear: string;
}

/* ---------- Space ---------- */

export type SpaceKind =
  | "Single room"
  | "Shared room"
  | "1 RK"
  | "1 BHK"
  | "2 BHK"
  | "3 BHK"
  | "4 BHK+"
  | "Bed in PG / Hostel"
  | "Something else";

export const SPACE_KINDS: { kind: SpaceKind; hint: string }[] = [
  { kind: "Single room", hint: "A private room for one person" },
  { kind: "Shared room", hint: "A room shared with other people" },
  { kind: "1 RK", hint: "One room with a kitchen" },
  { kind: "1 BHK", hint: "One bedroom, hall and kitchen" },
  { kind: "2 BHK", hint: "Two bedrooms, hall and kitchen" },
  { kind: "3 BHK", hint: "Three bedrooms, hall and kitchen" },
  { kind: "4 BHK+", hint: "Four or more bedrooms" },
  { kind: "Bed in PG / Hostel", hint: "A single bed in shared accommodation" },
  { kind: "Something else", hint: "Tell us what you're renting" },
];

/** BHK-style layouts double as whole-home SpaceKinds. */
export const BHK_KINDS = ["1 RK", "1 BHK", "2 BHK", "3 BHK", "4 BHK+"] as const;

export type BHKKind = (typeof BHK_KINDS)[number];

export type Policy = boolean | null; // true / false = specified, null = unspecified (no selection)

export const POLICY_ROWS = [
  { key: "couples", label: "Couples" },
  { key: "visitors", label: "Visitors" },
  { key: "pets", label: "Pets" },
  { key: "smoking", label: "Smoking" },
  { key: "alcohol", label: "Alcohol" },
] as const;

export type PolicyKey = (typeof POLICY_ROWS)[number]["key"];

export const AMENITIES = [
  "Wi-Fi",
  "AC",
  "Parking",
  "Power backup",
  "Water",
  "Washing machine / laundry",
  "Food / mess",
  "Attached bathroom",
  "Balcony",
  "Kitchen",
  "CCTV",
  "Security",
  "Housekeeping",
] as const;

export type HomeLayout = "" | "1 RK" | "1 BHK" | "2 BHK" | "3 BHK" | "4 BHK+";

export const HOME_LAYOUTS: Exclude<HomeLayout, "">[] = ["1 RK", "1 BHK", "2 BHK", "3 BHK", "4 BHK+"];

export interface SpaceState {
  kind: SpaceKind | "";
  whatDetail: string; // free text when kind === "Something else"
  buildingOther: string; // free text when buildingType === "Other"
  occupancy: 1 | 2 | 3 | 4 | null;
  beds: number | null; // beds in the room (shared rooms / PG beds) — prototype wording
  layout: HomeLayout; // whole-home layout (1 RK / BHK…) — PROTOTYPE-ONLY, no backend field yet
  sharing: "private" | "shared" | null;
  furnishing: "" | "Unfurnished" | "Semi-furnished" | "Fully furnished";
  audience: "" | "Anyone" | "Men" | "Women";
  bathrooms: string;
  floorNo: string;
  carpetArea: string;
  policies: Record<PolicyKey, Policy>;
  amenities: string[];
  houseRules: string;
  fullyIndependent: Policy; // private entrance, no shared living spaces — NOT a property type
  pgFood: "" | "included" | "separate" | "none"; // PG/hostel only; "" = unspecified
  pgCurfew: Policy; // PG/hostel only; gate time reuses place.gateTime
}

/* ---------- Basics ---------- */

export type RentBasis = "" | "person" | "room" | "place";

export interface BasicsState {
  title: string;
  description: string;
  rentBasis: RentBasis;
}

export const RENT_BASIS_SUFFIX: Record<Exclude<RentBasis, "">, string> = {
  person: "/ person",
  room: "/ room",
  place: "for the whole place",
};

/* ---------- Pricing ---------- */

export type ChargeKind =
  | "rent"
  | "deposit"
  | "food"
  | "maintenance"
  | "electricity"
  | "water"
  | "internet"
  | "other";

export type Frequency = "monthly" | "quarterly" | "yearly" | "once" | "metered";

export interface PriceRow {
  id: string;
  kind: ChargeKind;
  label: string; // custom name when kind === "other"
  amount: string; // rupees, whole numbers typed by owner
  frequency: Frequency;
  metered: boolean;
  rate: string; // per-unit rupees when metered
  mandatory: boolean; // every tenant pays it
  included: boolean; // shown inside the headline price
  refundable: boolean;
}

export const CHARGE_LABELS: Record<ChargeKind, string> = {
  rent: "Monthly rent",
  deposit: "Security deposit",
  food: "Food",
  maintenance: "Maintenance",
  electricity: "Electricity",
  water: "Water",
  internet: "Internet",
  other: "Other charge",
};

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
  once: "One-time",
  metered: "As used",
};

/* ---------- Photos ---------- */

export type PhotoStatus = "uploading" | "ready" | "failed";

export interface PhotoItem {
  id: string;
  img: string;
  status: PhotoStatus;
  order: number;
  cover: boolean;
}

/* ---------- Availability ---------- */

export type AvailabilityMode = "now" | "from" | "full" | null;

export interface AvailabilityState {
  mode: AvailabilityMode;
  date: string; // yyyy-mm-dd
}

/* ---------- Draft ---------- */

export type DraftStatus = "draft" | "published" | "paused";

export type FlowChapter =
  | "what"
  | "kind"
  | "where"
  | "space"
  | "included"
  | "who"
  | "photos"
  | "price"
  | "movein"
  | "name"
  | "listing";

export const CHAPTERS: { key: FlowChapter; label: string }[] = [
  { key: "what", label: "What" },
  { key: "kind", label: "Place" },
  { key: "where", label: "Where" },
  { key: "space", label: "Space" },
  { key: "included", label: "Included" },
  { key: "who", label: "Who" },
  { key: "photos", label: "Photos" },
  { key: "price", label: "Price" },
  { key: "movein", label: "Move-in" },
  { key: "name", label: "Name" },
  { key: "listing", label: "Listing" },
];

export interface ListingDraft {
  id: string;
  updatedAt: number;
  flow?: "v2";
  chapter?: FlowChapter; // where the owner currently is (v2 flow)
  done?: FlowChapter[]; // completed chapters (v2 flow)
  furthestStep: number; // index into STEP_KEYS the owner may visit (v1 flow)
  place: PlaceState;
  space: SpaceState;
  basics: BasicsState;
  prices: PriceRow[];
  photos: PhotoItem[];
  availability: AvailabilityState;
  status: DraftStatus;
}

export function emptyDraft(id: string): ListingDraft {
  return {
    id,
    updatedAt: Date.now(),
    furthestStep: 0,
    place: {
      buildingType: "",
      address: "",
      locality: "",
      area: "",
      city: "Guwahati",
      pincode: "",
      gateTime: "",
      independent: null,
      nearCollege: "",
      nearWorkplace: "",
      floors: "",
      builtYear: "",
    },
    space: {
      kind: "",
      whatDetail: "",
      buildingOther: "",
      occupancy: null,
      beds: null,
      layout: "",
      sharing: null,
      furnishing: "",
      audience: "",
      bathrooms: "",
      floorNo: "",
      carpetArea: "",
      policies: { couples: null, visitors: null, pets: null, smoking: null, alcohol: null },
      amenities: [],
      houseRules: "",
      fullyIndependent: null,
      pgFood: "",
      pgCurfew: null,
    },
    basics: { title: "", description: "", rentBasis: "" },
    prices: [],
    photos: [],
    availability: { mode: null, date: "" },
    status: "draft",
  };
}

/* ---------- Derived helpers ---------- */

export function inr(n: number): string {
  return "₹" + n.toLocaleString("en-IN");
}

export function parseRs(v: string): number | null {
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

export function rentRow(d: ListingDraft): PriceRow | undefined {
  return d.prices.find((p) => p.kind === "rent");
}

/** Headline monthly price tenants see + monthly extras + one-time deposit. */
export function priceSummary(d: ListingDraft): {
  headline: number;
  extras: number;
  deposit: number;
  meteredCount: number;
} {
  let headline = 0;
  let extras = 0;
  let deposit = 0;
  let meteredCount = 0;
  for (const p of d.prices) {
    if (p.kind === "deposit") {
      const a = parseRs(p.amount);
      if (a) deposit += a;
      continue;
    }
    if (p.metered) {
      meteredCount += 1;
      continue;
    }
    const a = parseRs(p.amount);
    if (!a || p.frequency !== "monthly") continue;
    if (p.included) headline += a;
    else extras += a;
  }
  return { headline, extras, deposit, meteredCount };
}

export interface ReadinessItem {
  key: "photos" | "rent" | "location" | "availability" | "details";
  ok: boolean;
  label: string;
  detail: string;
  step: FlowChapter;
}

export function readiness(d: ListingDraft): ReadinessItem[] {
  const readyPhotos = d.photos.filter((p) => p.status === "ready").length;
  const rent = rentRow(d);
  const placeOk =
    d.place.address.trim().length > 0 &&
    d.place.city.trim().length > 0 &&
    d.place.area.trim().length > 0;
  const availOk =
    d.availability.mode === "now" ||
    (d.availability.mode === "from" && d.availability.date.length > 0);
  const titleOk = d.basics.title.trim().length >= 2;
  return [
    {
      key: "photos",
      ok: readyPhotos >= 3,
      label: "Photos",
      detail:
        readyPhotos >= 3 ? `${readyPhotos} ready` : `Add ${3 - readyPhotos} more photo${readyPhotos === 2 ? "" : "s"}`,
      step: "photos",
    },
    {
      key: "rent",
      ok: !!rent && parseRs(rent.amount) !== null,
      label: "Rent",
      detail:
        rent && parseRs(rent.amount) !== null
          ? inr(parseRs(rent.amount) as number) + " / month"
          : "Not set yet",
      step: "price",
    },
    {
      key: "location",
      ok: placeOk,
      label: "Location",
      detail: placeOk ? d.place.area.trim() : "Area missing",
      step: "where",
    },
    {
      key: "availability",
      ok: availOk,
      label: "Availability",
      detail:
        d.availability.mode === "full"
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
      detail: titleOk ? "Title set" : "Name your listing",
      step: "name",
    },
  ];
}

export function allReady(d: ListingDraft): boolean {
  return readiness(d).every((r) => r.ok);
}

/** Effective cover: explicit mark with lowest order wins, else lowest-order ready photo. */
export function effectiveCoverId(d: ListingDraft): string | null {
  const ready = d.photos
    .filter((p) => p.status === "ready")
    .sort((a, b) => a.order - b.order);
  if (ready.length === 0) return null;
  const explicit = ready.filter((p) => p.cover);
  if (explicit.length > 0)
    return explicit.sort((a, b) => a.order - b.order)[0].id;
  return ready[0].id;
}

/** Normalize older (v1) drafts so the v2 flow always sees complete state. */
export function normalizeDraft(d: ListingDraft): ListingDraft {
  const fresh = emptyDraft(d.id);
  return {
    ...fresh,
    ...d,
    flow: "v2",
    chapter: d.chapter ?? "what",
    done: d.done ?? [],
    place: { ...fresh.place, ...(d.place ?? {}) },
    space: {
      ...fresh.space,
      ...(d.space ?? {}),
      policies: { ...fresh.space.policies, ...((d.space ?? {}) as SpaceState).policies },
      amenities: (d.space as SpaceState)?.amenities ?? [],
    },
    basics: { ...fresh.basics, ...(d.basics ?? {}) },
    availability: { ...fresh.availability, ...(d.availability ?? {}) },
    prices: d.prices ?? [],
    photos: (d.photos ?? []).map((p, i) => ({ ...p, order: i })),
  };
}

export function isWholeHome(kind: SpaceKind | ""): kind is BHKKind {
  return (BHK_KINDS as readonly string[]).includes(kind);
}

export function needsBeds(kind: SpaceKind | ""): boolean {
  return kind === "Shared room" || kind === "Bed in PG / Hostel";
}

/** Chapter completion (v2): only what the owner has actually answered counts. */
export function chapterDone(d: ListingDraft, c: FlowChapter): boolean {
  switch (c) {
    case "what":
      return d.space.kind !== "";
    case "kind":
      return d.place.buildingType !== "";
    case "where":
      return (
        d.place.address.trim().length >= 5 &&
        d.place.area.trim().length > 0 &&
        d.place.city.trim().length > 0
      );
    case "space": {
      const s = d.space;
      if (!s.kind || !s.furnishing) return false;
      if (needsBeds(s.kind)) return s.beds !== null;
      return true;
    }
    case "included":
      return true; // optional by design — everything optional counts
    case "who":
      return d.space.audience !== "";
    case "photos":
      return d.photos.filter((p) => p.status === "ready").length >= 1;
    case "price": {
      const r = rentRow(d);
      return !!r && parseRs(r.amount) !== null;
    }
    case "movein":
      return d.availability.mode !== null;
    case "name":
      return d.basics.title.trim().length >= 2;
    case "listing":
      return d.status === "published";
  }
}

/** Build a sensible headline from what the owner already told us. */
export function suggestTitle(d: ListingDraft): string {
  const near = d.place.nearCollege.trim() || d.place.area.trim() || d.place.locality.trim();
  const where = near ? ` near ${near}` : "";
  const furn = d.space.furnishing ? `${d.space.furnishing} ` : "";
  if (isWholeHome(d.space.kind) && d.space.layout)
    return `${furn}${d.space.layout}${where}`.trim();
  switch (d.space.kind) {
    case "Single room":
      return `Single room${where}`;
    case "Shared room":
      return `Shared room${where}`;
    case "Bed in PG / Hostel":
      return `PG bed${where}`;
    case "Something else":
      return `${d.space.whatDetail.trim() || "Room for rent"}${where}`;
    default:
      return `Place for rent${where}`;
  }
}

export function availabilityLine(d: ListingDraft): string {
  if (d.availability.mode === "now") return "Ready now";
  if (d.availability.mode === "from" && d.availability.date)
    return `Available from ${d.availability.date}`;
  if (d.availability.mode === "full") return "Currently full";
  return "Availability not set";
}
