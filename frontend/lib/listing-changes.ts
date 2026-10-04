/**
 * P2.2 Review Changes: pure savedSnapshot-vs-draft diff for Edit Listing.
 *
 * Compares the P2.1 edit session's `savedSnapshot` against the current
 * working draft and returns grouped, human-readable changes for the
 * review screen. UI/state only:
 *
 * - no I/O, no backend calls, no mutations of either input
 * - volatile/transient state (timestamps, navigation, progress,
 *   expiring view URLs, transient upload errors) never counts
 * - only meaningful editable fields are compared, using the same
 *   normalization spirit as P2.1's comparableDraft
 * - no new notion of "dirty": callers keep using editSessionDirty as
 *   the authority; an empty diff simply means nothing visible changed
 */

import {
  BUILDING_KINDS,
  EXTRA_FREQUENCIES,
  EXTRA_KINDS,
  RENTAL_KINDS,
  inr,
  parseRupees,
  type AvailabilityDraft,
  type ExtraChargeDraft,
  type ListingDraft,
  type PhotoDraft,
} from "./listing-draft";

export type ChangeGroupId =
  | "listing"
  | "property"
  | "space"
  | "rules"
  | "pricing"
  | "availability"
  | "photos";

export interface ChangeField {
  /** Stable key for tests/keys, e.g. "pricing.rent". Never shown. */
  key: string;
  /** Human-readable field label, e.g. "Monthly rent". */
  label: string;
  /** Formatted savedSnapshot value ("Not specified" when empty). */
  before: string;
  /** Formatted current-draft value ("Not specified" when empty). */
  after: string;
  /**
   * Commercial significance (rent, rental type): the eventual P2.3 save
   * pipeline will require explicit confirmation for these. P2.2 only
   * marks them visibly; nothing here confirms or saves.
   */
  significant: boolean;
}

export interface ChangeGroup {
  id: ChangeGroupId;
  title: string;
  changes: ChangeField[];
}

/** Display for null/unspecified values. Never "null"/"undefined". */
export const NOT_SPECIFIED = "Not specified";

function text(value: string | null | undefined): string {
  const t = (value ?? "").trim();
  return t === "" ? NOT_SPECIFIED : t;
}

function changed(before: string, after: string): boolean {
  return before !== after;
}

function textField(
  key: string,
  label: string,
  before: string | null | undefined,
  after: string | null | undefined,
  significant = false
): ChangeField | null {
  const b = text(before);
  const a = text(after);
  if (!changed(b, a)) return null;
  return { key, label, before: b, after: a, significant };
}

function boolField(
  key: string,
  label: string,
  before: boolean | null | undefined,
  after: boolean | null | undefined,
  labels: { yes: string; no: string },
  significant = false
): ChangeField | null {
  const fmt = (v: boolean | null | undefined) =>
    v === true ? labels.yes : v === false ? labels.no : NOT_SPECIFIED;
  const b = fmt(before);
  const a = fmt(after);
  if (!changed(b, a)) return null;
  return { key, label, before: b, after: a, significant };
}

function lookup<T extends string>(
  table: { value: string; title: string }[],
  value: T | ""
): string {
  if (!value) return NOT_SPECIFIED;
  return table.find((row) => row.value === value)?.title ?? NOT_SPECIFIED;
}

/* ------------------------------------------------------------------ */
/* Listing group                                                        */
/* ------------------------------------------------------------------ */

function diffListingGroup(
  before: ListingDraft,
  after: ListingDraft
): ChangeField[] {
  const out: ChangeField[] = [];
  const title = textField(
    "listing.title",
    "Listing title",
    before.listing.title,
    after.listing.title
  );
  if (title) out.push(title);
  const description = textField(
    "listing.description",
    "Listing description",
    before.listing.description,
    after.listing.description
  );
  if (description) out.push(description);
  return out;
}

/* ------------------------------------------------------------------ */
/* Property group                                                       */
/* ------------------------------------------------------------------ */

function areaName(d: ListingDraft): string {
  return (
    d.place.area?.name.trim() ||
    d.place.areaCustomName.trim() ||
    NOT_SPECIFIED
  );
}

function buildingLabel(d: ListingDraft): string {
  if (!d.place.buildingType) return NOT_SPECIFIED;
  const title = lookup(BUILDING_KINDS, d.place.buildingType);
  if (d.place.buildingType === "OTHER" && d.place.buildingOther.trim())
    return `${title} — ${d.place.buildingOther.trim()}`;
  return title;
}

function nearbyName(
  item: { name: string } | null
): string {
  const t = item?.name.trim() ?? "";
  return t === "" ? NOT_SPECIFIED : t;
}

function diffPropertyGroup(
  before: ListingDraft,
  after: ListingDraft
): ChangeField[] {
  const out: ChangeField[] = [];
  const push = (f: ChangeField | null) => {
    if (f) out.push(f);
  };
  push(
    textField(
      "place.placeName",
      "Property name",
      before.place.placeName,
      after.place.placeName
    )
  );
  const bBuilding = buildingLabel(before);
  const aBuilding = buildingLabel(after);
  if (changed(bBuilding, aBuilding))
    out.push({
      key: "place.buildingType",
      label: "Property type",
      before: bBuilding,
      after: aBuilding,
      significant: false,
    });
  push(
    textField(
      "place.address",
      "Address",
      before.place.address,
      after.place.address
    )
  );
  push(
    textField(
      "place.locality",
      "Locality",
      before.place.locality,
      after.place.locality
    )
  );
  const bArea = areaName(before);
  const aArea = areaName(after);
  if (changed(bArea, aArea))
    out.push({
      key: "place.area",
      label: "Area",
      before: bArea,
      after: aArea,
      significant: false,
    });
  push(textField("place.city", "City", before.place.city, after.place.city));
  push(
    textField(
      "place.pincode",
      "Pincode",
      before.place.pincode,
      after.place.pincode
    )
  );
  const bCollege = nearbyName(before.place.college);
  const aCollege = nearbyName(after.place.college);
  if (changed(bCollege, aCollege))
    out.push({
      key: "place.college",
      label: "Nearby college",
      before: bCollege,
      after: aCollege,
      significant: false,
    });
  const bWork = nearbyName(before.place.workplace);
  const aWork = nearbyName(after.place.workplace);
  if (changed(bWork, aWork))
    out.push({
      key: "place.workplace",
      label: "Nearby workplace",
      before: bWork,
      after: aWork,
      significant: false,
    });
  return out;
}

/* ------------------------------------------------------------------ */
/* Space group                                                          */
/* ------------------------------------------------------------------ */

function kindLabel(d: ListingDraft): string {
  if (!d.space.kind) return NOT_SPECIFIED;
  const title = lookup(RENTAL_KINDS, d.space.kind);
  if (d.space.kind === "other" && d.space.detail.trim())
    return `${title} — ${d.space.detail.trim()}`;
  return title;
}

function bedsLabel(beds: number | null): string {
  if (beds === null || beds === undefined) return NOT_SPECIFIED;
  return beds === 5 ? "5+ beds" : `${beds} beds`;
}

function foodLabel(v: string): string {
  if (v === "included") return "Included in rent";
  if (v === "separate") return "Available separately";
  if (v === "none") return "No food";
  return NOT_SPECIFIED;
}

function diffSpaceGroup(
  before: ListingDraft,
  after: ListingDraft
): ChangeField[] {
  const out: ChangeField[] = [];
  const push = (f: ChangeField | null) => {
    if (f) out.push(f);
  };
  const bKind = kindLabel(before);
  const aKind = kindLabel(after);
  if (changed(bKind, aKind))
    out.push({
      key: "space.kind",
      label: "Rental type",
      before: bKind,
      after: aKind,
      significant: true,
    });
  const bBeds = bedsLabel(before.space.beds);
  const aBeds = bedsLabel(after.space.beds);
  if (changed(bBeds, aBeds))
    out.push({
      key: "space.beds",
      label: "Beds",
      before: bBeds,
      after: aBeds,
      significant: false,
    });
  push(
    textField(
      "space.furnishing",
      "Furnishing",
      before.space.furnishing,
      after.space.furnishing
    )
  );
  push(
    boolField(
      "space.independent",
      "Independent / private entrance",
      before.space.independent,
      after.space.independent,
      { yes: "Yes", no: "No" }
    )
  );
  push(
    textField(
      "space.bathrooms",
      "Bathrooms",
      before.space.bathrooms,
      after.space.bathrooms
    )
  );
  push(
    textField(
      "space.floorNo",
      "Floor",
      before.space.floorNo,
      after.space.floorNo
    )
  );
  const bArea = before.space.carpetArea.trim();
  const aArea = after.space.carpetArea.trim();
  if (changed(bArea, aArea))
    out.push({
      key: "space.carpetArea",
      label: "Carpet area",
      before: bArea === "" ? NOT_SPECIFIED : `${bArea} sq ft`,
      after: aArea === "" ? NOT_SPECIFIED : `${aArea} sq ft`,
      significant: false,
    });
  push(
    textField(
      "space.audience",
      "Who can stay",
      before.space.audience,
      after.space.audience
    )
  );
  const bFood = foodLabel(before.space.pgFood);
  const aFood = foodLabel(after.space.pgFood);
  if (changed(bFood, aFood))
    out.push({
      key: "space.pgFood",
      label: "Food",
      before: bFood,
      after: aFood,
      significant: false,
    });
  push(
    boolField("space.pgCurfew", "Curfew", before.space.pgCurfew, after.space.pgCurfew, {
      yes: "Yes",
      no: "No",
    })
  );
  // Amenities are read-only labels from the existing AMENITIES list (no
  // catalog, no ids invented): show the human labels that changed.
  const beforeAmenities = [...before.space.amenities].sort();
  const afterAmenities = [...after.space.amenities].sort();
  if (changed(JSON.stringify(beforeAmenities), JSON.stringify(afterAmenities)))
    out.push({
      key: "space.amenities",
      label: "Amenities",
      before:
        beforeAmenities.length > 0
          ? beforeAmenities.join(", ")
          : "None selected",
      after:
        afterAmenities.length > 0 ? afterAmenities.join(", ") : "None selected",
      significant: false,
    });
  return out;
}

/* ------------------------------------------------------------------ */
/* House rules / stay group                                             */
/* ------------------------------------------------------------------ */

const POLICY_LABELS: { key: keyof ListingDraft["space"]["policies"]; label: string }[] = [
  { key: "couples", label: "Couples" },
  { key: "visitors", label: "Visitors" },
  { key: "pets", label: "Pets" },
  { key: "smoking", label: "Smoking" },
  { key: "alcohol", label: "Alcohol" },
];

function formatGateTime(v: string): string {
  const t = v.trim();
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(t);
  if (!m) return t === "" ? NOT_SPECIFIED : t;
  let h = Number(m[1]);
  const min = m[2];
  if (!Number.isInteger(h) || h < 0 || h > 23) return t;
  const suffix = h < 12 ? "AM" : "PM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${min} ${suffix}`;
}

function diffRulesGroup(
  before: ListingDraft,
  after: ListingDraft
): ChangeField[] {
  const out: ChangeField[] = [];
  for (const row of POLICY_LABELS) {
    const f = boolField(
      `space.policies.${row.key}`,
      row.label,
      before.space.policies[row.key],
      after.space.policies[row.key],
      { yes: "Allowed", no: "Not allowed" }
    );
    if (f) out.push(f);
  }
  const houseRules = textField(
    "space.houseRules",
    "House rules note",
    before.space.houseRules,
    after.space.houseRules
  );
  if (houseRules) out.push(houseRules);
  const bGate = formatGateTime(before.place.gateTime);
  const aGate = formatGateTime(after.place.gateTime);
  if (changed(bGate, aGate))
    out.push({
      key: "place.gateTime",
      label: "Gate closing time",
      before: bGate,
      after: aGate,
      significant: false,
    });
  return out;
}

/* ------------------------------------------------------------------ */
/* Pricing group                                                        */
/* ------------------------------------------------------------------ */

function moneyField(
  key: string,
  label: string,
  before: string,
  after: string,
  suffix: string,
  significant = false
): ChangeField | null {
  const fmt = (v: string) => {
    const n = parseRupees(v);
    return n === null ? NOT_SPECIFIED : `${inr(n)}${suffix}`;
  };
  const b = fmt(before);
  const a = fmt(after);
  if (!changed(b, a)) return null;
  return { key, label, before: b, after: a, significant };
}

function rentBasisLabel(v: string): string {
  if (v === "person") return "Per person";
  if (v === "room") return "Per room";
  if (v === "place") return "For the whole place";
  return NOT_SPECIFIED;
}

function extraLine(row: ExtraChargeDraft): string {
  const kind =
    row.kind === "other"
      ? row.label.trim() || "Other"
      : (EXTRA_KINDS.find((k) => k.value === row.kind)?.title ?? row.kind);
  const freq =
    EXTRA_FREQUENCIES.find((f) => f.value === row.frequency)?.title ??
    row.frequency;
  const amount = row.metered
    ? (() => {
        const rate = parseRupees(row.rate);
        return rate === null ? "rate not set" : `${inr(rate)} per unit`;
      })()
    : (() => {
        const n = parseRupees(row.amount);
        return n === null ? "amount not set" : inr(n);
      })();
  const who = row.mandatory ? "Everyone pays" : "Optional add-on";
  const where = row.included ? "In headline price" : "Shown as extra";
  return `${kind} — ${amount}/${freq} · ${who} · ${where}`;
}

/**
 * Extra charges compared as sorted human-readable lines: added and
 * removed rows stay understandable without exposing row ids or order.
 */
function extrasSummary(extras: ExtraChargeDraft[]): string {
  if (extras.length === 0) return "None";
  return [...extras.map(extraLine)].sort().join("\n");
}

function diffPricingGroup(
  before: ListingDraft,
  after: ListingDraft
): ChangeField[] {
  const out: ChangeField[] = [];
  const push = (f: ChangeField | null) => {
    if (f) out.push(f);
  };
  push(
    moneyField(
      "pricing.rent",
      "Monthly rent",
      before.pricing.rent,
      after.pricing.rent,
      " / month",
      true
    )
  );
  const bBasis = rentBasisLabel(before.pricing.rentBasis);
  const aBasis = rentBasisLabel(after.pricing.rentBasis);
  if (changed(bBasis, aBasis))
    out.push({
      key: "pricing.rentBasis",
      label: "Rent basis",
      before: bBasis,
      after: aBasis,
      significant: false,
    });
  push(
    moneyField(
      "pricing.deposit",
      "Security deposit",
      before.pricing.deposit,
      after.pricing.deposit,
      " · one-time"
    )
  );
  const bExtras = extrasSummary(before.pricing.extras);
  const aExtras = extrasSummary(after.pricing.extras);
  if (changed(bExtras, aExtras))
    out.push({
      key: "pricing.extras",
      label: "Extra charges",
      before: bExtras,
      after: aExtras,
      significant: false,
    });
  return out;
}

/* ------------------------------------------------------------------ */
/* Availability group                                                   */
/* ------------------------------------------------------------------ */

function formatMoveInDate(yyyyMmDd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyyMmDd.trim());
  if (!m) return yyyyMmDd.trim();
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const month = months[Number(m[2]) - 1];
  if (!month) return yyyyMmDd.trim();
  return `${Number(m[3])} ${month} ${m[1]}`;
}

function availabilityLabel(a: AvailabilityDraft): string {
  if (a.mode === "now") return "Ready now";
  if (a.mode === "occupied") return "Currently full";
  if (a.mode === "from")
    return a.date.trim()
      ? `Available from ${formatMoveInDate(a.date)}`
      : "Available from a date";
  return NOT_SPECIFIED;
}

function diffAvailabilityGroup(
  before: ListingDraft,
  after: ListingDraft
): ChangeField[] {
  const b = availabilityLabel(before.availability);
  const a = availabilityLabel(after.availability);
  if (!changed(b, a)) return [];
  return [
    {
      key: "availability",
      label: "Move-in",
      before: b,
      after: a,
      significant: false,
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Photos group (read-only acknowledgement, no save pipeline)           */
/* ------------------------------------------------------------------ */

function photoSummary(photos: PhotoDraft[]): string {
  if (photos.length === 0) return "No photos";
  const ordered = [...photos].sort((a, b) => a.order - b.order);
  const coverIndex = ordered.findIndex((p) => p.cover);
  const cover =
    coverIndex >= 0 ? `, cover on photo ${coverIndex + 1}` : "";
  return `${photos.length} photo${photos.length === 1 ? "" : "s"}${cover}`;
}

function photoSignature(photos: PhotoDraft[]): string {
  // Stable identity only: volatile previews (src), expiring view URLs,
  // and transient errors never count as changes.
  return JSON.stringify(
    [...photos]
      .map((p) => ({
        id: p.backendId ?? p.id,
        status: p.status,
        cover: p.cover,
        order: p.order,
      }))
      .sort((a, b) => a.order - b.order || String(a.id).localeCompare(String(b.id)))
  );
}

function diffPhotosGroup(
  before: ListingDraft,
  after: ListingDraft
): ChangeField[] {
  if (photoSignature(before.photos) === photoSignature(after.photos)) return [];
  return [
    {
      key: "photos",
      label: "Photos",
      before: photoSummary(before.photos),
      after: photoSummary(after.photos),
      significant: false,
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Entry point                                                          */
/* ------------------------------------------------------------------ */

const GROUP_TITLES: { id: ChangeGroupId; title: string }[] = [
  { id: "listing", title: "Listing" },
  { id: "property", title: "Property" },
  { id: "space", title: "Space" },
  { id: "rules", title: "House rules & stay" },
  { id: "pricing", title: "Pricing" },
  { id: "availability", title: "Availability" },
  { id: "photos", title: "Photos" },
];

/**
 * Pure diff of savedSnapshot -> current draft. Returns only groups with
 * at least one change, in stable presentation order. Neither input is
 * mutated.
 */
export function diffListingChanges(
  before: ListingDraft,
  after: ListingDraft
): ChangeGroup[] {
  const byId: Record<ChangeGroupId, ChangeField[]> = {
    listing: diffListingGroup(before, after),
    property: diffPropertyGroup(before, after),
    space: diffSpaceGroup(before, after),
    rules: diffRulesGroup(before, after),
    pricing: diffPricingGroup(before, after),
    availability: diffAvailabilityGroup(before, after),
    photos: diffPhotosGroup(before, after),
  };
  return GROUP_TITLES.filter((g) => byId[g.id].length > 0).map((g) => ({
    id: g.id,
    title: g.title,
    changes: byId[g.id],
  }));
}

/** Total changed fields across all groups. */
export function countChanges(groups: ChangeGroup[]): number {
  return groups.reduce((n, g) => n + g.changes.length, 0);
}

/** True when at least one group carries a commercial (significant) change. */
export function hasSignificantChanges(groups: ChangeGroup[]): boolean {
  return groups.some((g) => g.changes.some((c) => c.significant));
}
