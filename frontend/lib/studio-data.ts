/**
 * Owner Studio data aggregation (Phase A — data foundation only, no UI).
 *
 * Consumes the existing owner reads plus the UID-scoped local draft store
 * and produces ONE normalized representation:
 *
 *   Firebase Auth (inside api.ts, untouched)
 *     -> listOwnerProperties / listPropertyUnits / listOwnerListings
 *     +  loadDrafts(uid)
 *     -> aggregateStudioData()
 *     -> StudioData { summary, properties, drafts, attention, insights }
 *
 * Rules enforced here:
 * - Property -> Unit -> Listing hierarchy is preserved, never flattened.
 * - Lifecycle (DRAFT/PUBLISHED/PAUSED/…) and availability
 *   (AVAILABLE_NOW/AVAILABLE_FROM_DATE/OCCUPIED) stay separate fields.
 * - No currency formatting (presentation uses `inr()` later); money stays
 *   numeric, missing rent stays null (never ₹0-as-free).
 * - No views/enquiries/visits/revenue: that event data does not exist.
 * - Backend failure never erases local drafts; malformed rows are skipped
 *   and counted, never trusted.
 *
 * No React, no JSX, no CSS, no UI strings. No new backend calls beyond the
 * three existing owner reads. No store, no cache, no framework.
 */

import {
  ApiError,
  listOwnerListings,
  listOwnerProperties,
  listPropertyUnits,
} from "./api";
import {
  loadDrafts as loadStoredDrafts,
  normalizeBackendId,
  type ListingDraft,
} from "./listing-draft";
import type { SubmitStep } from "./listing-submit-flow";

/* ------------------------------------------------------------------ */
/* Normalized model                                                     */
/* ------------------------------------------------------------------ */

export interface StudioRent {
  amountPaise: number;
  billingFrequency: string;
  calculationBasis: string;
}

export interface StudioAvailability {
  status: string;
  availableFrom: string | null;
}

export interface StudioPriceRow {
  chargeType: string;
  amountPaise: number | null;
  billingFrequency: string;
  calculationBasis: string;
  mandatory: boolean;
  includedInAdvertised: boolean;
}

export interface StudioListing {
  id: number;
  title: string;
  description: string | null;
  rentBasis: string;
  /** Lifecycle, verbatim backend literal. Never merged with availability. */
  lifecycle: string;
  availability: StudioAvailability;
  /** Headline RENT row, or null when no usable RENT component exists. */
  rent: StudioRent | null;
  priceComponents: StudioPriceRow[];
  photoCount: number;
}

export interface StudioUnit {
  id: number;
  propertyId: number;
  unitType: string;
  layout: string | null;
  /** Semantic kind label for cards ("Private room", "1 RK", …). No styling. */
  displayKind: string;
  listing: StudioListing | null;
}

export interface StudioProperty {
  id: number;
  propertyType: string;
  /** Owner-defined place identity; null for legacy unnamed properties. */
  name: string | null;
  addressLine: string;
  locality: string | null;
  city: string | null;
  areaName: string | null;
  units: StudioUnit[];
}

export interface StudioDraft {
  draftId: string;
  title: string | null;
  updatedAt: number;
  currentChapter: ListingDraft["currentChapter"];
  furthestChapter: ListingDraft["furthestChapter"];
  /** "local" = never sent; "pending" = backend ids/progress recorded. */
  kind: "local" | "pending";
  backendIds: { propertyId: number | null; unitId: number | null; listingId: number | null };
  progress: { price: boolean; availability: boolean };
  /** Steps still outstanding (empty for local drafts by definition). */
  remainingSteps: SubmitStep[];
}

export type AttentionReason = "send-incomplete" | "stale-draft";

export interface StudioAttention {
  key: string;
  reason: AttentionReason;
  /** 1 = most urgent. Follows dashboard priority: send, stale, photos. */
  priority: number;
  draftId: string | null;
  listingId: number | null;
  unitId: number | null;
  propertyId: number | null;
  remainingSteps: SubmitStep[];
  draftAgeDays: number | null;
}

export interface StudioSummary {
  propertyCount: number;
  unitCount: number;
  listingCount: number;
  publishedCount: number;
  pausedCount: number;
  /** Listings whose lifecycle status is DRAFT. */
  draftListingCount: number;
  /** Sent-but-incomplete local drafts (retry candidates). */
  pendingCount: number;
  /** Never-sent local drafts (continue candidates). */
  localDraftCount: number;
}

export interface StudioInsights {
  availability: {
    availableNow: number;
    availableFromDate: number;
    occupied: number;
  };
  health: {
    published: number;
    paused: number;
    draft: number;
    /** Published listings with zero photos. */
    missingPhotos: number;
    /** Published listings with no usable RENT component. */
    missingRent: number;
  };
}

export interface StudioErrors {
  listingsUnavailable: boolean;
  unitsFailed: number;
  discarded: { properties: number; units: number; listings: number };
}

export interface StudioData {
  summary: StudioSummary;
  properties: StudioProperty[];
  drafts: StudioDraft[];
  attention: StudioAttention[];
  insights: StudioInsights;
  errors: StudioErrors;
}

/* ------------------------------------------------------------------ */
/* Row validation (unknown fetch shapes -> normalized or skipped)       */
/* ------------------------------------------------------------------ */

interface PropertyRow {
  id: number;
  property_type: string;
  name: string | null;
  address_line: string;
  locality: string | null;
  city: string | null;
  areaName: string | null;
}

function asPropertyRow(v: unknown): PropertyRow | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  if (typeof r["id"] !== "number" || !Number.isInteger(r["id"])) return null;
  if (typeof r["property_type"] !== "string") return null;
  if (typeof r["address_line"] !== "string") return null;
  const area = r["area_location"];
  return {
    id: r["id"],
    property_type: r["property_type"],
    // Missing key (pre-name backend) and non-strings both mean unnamed.
    name: typeof r["name"] === "string" ? r["name"] : null,
    address_line: r["address_line"],
    locality: typeof r["locality"] === "string" ? r["locality"] : null,
    city: typeof r["city"] === "string" ? r["city"] : null,
    areaName:
      area && typeof area === "object" && typeof (area as Record<string, unknown>)["name"] === "string"
        ? ((area as Record<string, unknown>)["name"] as string)
        : null,
  };
}

interface UnitRow {
  id: number;
  property_id: number;
  unit_type: string;
  layout: string | null;
}

function asUnitRow(v: unknown): UnitRow | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  if (typeof r["id"] !== "number" || !Number.isInteger(r["id"])) return null;
  if (typeof r["property_id"] !== "number") return null;
  if (typeof r["unit_type"] !== "string") return null;
  return {
    id: r["id"],
    property_id: r["property_id"],
    unit_type: r["unit_type"],
    layout: typeof r["layout"] === "string" ? r["layout"] : null,
  };
}

interface ListingRow {
  id: number;
  rental_unit_id: number;
  title: string;
  description: string | null;
  rent_basis: string;
  status: string;
  availability_status: string;
  available_from: string | null;
  prices: StudioPriceRow[];
  photoCount: number;
}

function asPriceRow(v: unknown): StudioPriceRow | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  if (typeof r["charge_type"] !== "string") return null;
  return {
    chargeType: r["charge_type"],
    amountPaise:
      typeof r["amount_paise"] === "number" ? r["amount_paise"] : null,
    billingFrequency:
      typeof r["billing_frequency"] === "string" ? r["billing_frequency"] : "",
    calculationBasis:
      typeof r["calculation_basis"] === "string" ? r["calculation_basis"] : "",
    mandatory: r["mandatory"] === true,
    includedInAdvertised: r["included_in_advertised"] === true,
  };
}

function asListingRow(v: unknown): ListingRow | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  if (typeof r["id"] !== "number" || !Number.isInteger(r["id"])) return null;
  if (typeof r["rental_unit_id"] !== "number") return null;
  if (typeof r["title"] !== "string") return null;
  if (typeof r["rent_basis"] !== "string") return null;
  if (typeof r["status"] !== "string") return null;
  if (typeof r["availability_status"] !== "string") return null;
  const prices = Array.isArray(r["price_components"])
    ? r["price_components"].map(asPriceRow).filter((p): p is StudioPriceRow => p !== null)
    : [];
  return {
    id: r["id"],
    rental_unit_id: r["rental_unit_id"],
    title: r["title"],
    description: typeof r["description"] === "string" ? r["description"] : null,
    rent_basis: r["rent_basis"],
    status: r["status"],
    availability_status: r["availability_status"],
    available_from:
      typeof r["available_from"] === "string" ? r["available_from"] : null,
    prices,
    photoCount: Array.isArray(r["photos"]) ? r["photos"].length : 0,
  };
}

/* ------------------------------------------------------------------ */
/* Derivation helpers                                                   */
/* ------------------------------------------------------------------ */

const UNIT_KIND_LABELS: Record<string, string> = {
  PRIVATE_ROOM: "Private room",
  SHARED_ROOM_BED: "Shared room",
  PG_BED: "PG bed",
  ENTIRE_FLAT: "Entire flat",
  ENTIRE_STUDIO: "Entire studio",
  OTHER: "Other space",
};

function displayKindFor(unitType: string, layout: string | null): string {
  if (layout) return layout;
  return UNIT_KIND_LABELS[unitType] ?? unitType;
}

function rentFrom(prices: StudioPriceRow[]): StudioRent | null {
  const rent = prices.find((p) => p.chargeType === "RENT");
  if (!rent || typeof rent.amountPaise !== "number") return null;
  return {
    amountPaise: rent.amountPaise,
    billingFrequency: rent.billingFrequency,
    calculationBasis: rent.calculationBasis,
  };
}

function normalizeListing(row: ListingRow): StudioListing {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    rentBasis: row.rent_basis,
    lifecycle: row.status,
    availability: {
      status: row.availability_status,
      availableFrom: row.available_from,
    },
    rent: rentFrom(row.prices),
    priceComponents: row.prices,
    photoCount: row.photoCount,
  };
}

function remainingStepsFor(d: ListingDraft): SubmitStep[] {
  const steps: SubmitStep[] = [];
  if (normalizeBackendId(d.backendIds?.propertyId) === null) steps.push("property");
  if (normalizeBackendId(d.backendIds?.unitId) === null) steps.push("unit");
  if (normalizeBackendId(d.backendIds?.listingId) === null) steps.push("listing");
  if (d.submitProgress?.price !== true) steps.push("price");
  if (d.submitProgress?.availability !== true) steps.push("availability");
  return steps;
}

function normalizeDraft(d: ListingDraft): StudioDraft {
  const backendIds = {
    propertyId: normalizeBackendId(d.backendIds?.propertyId),
    unitId: normalizeBackendId(d.backendIds?.unitId),
    listingId: normalizeBackendId(d.backendIds?.listingId),
  };
  const progress = {
    price: d.submitProgress?.price === true,
    availability: d.submitProgress?.availability === true,
  };
  const sent =
    backendIds.propertyId !== null ||
    backendIds.unitId !== null ||
    backendIds.listingId !== null ||
    progress.price ||
    progress.availability;
  const title = d.listing.title.trim();
  return {
    draftId: d.id,
    title: title.length > 0 ? title : null,
    updatedAt: d.updatedAt,
    currentChapter: d.currentChapter,
    furthestChapter: d.furthestChapter,
    kind: sent ? "pending" : "local",
    backendIds,
    progress,
    remainingSteps: sent ? remainingStepsFor(d) : [],
  };
}

/** Local drafts older than this surface as stale attention candidates. */
export const STALE_DRAFT_MS = 7 * 24 * 60 * 60 * 1000;

/** Attention list is capped; priority order decides what survives. */
export const MAX_ATTENTION = 5;

/* ------------------------------------------------------------------ */
/* Pure aggregation                                                     */
/* ------------------------------------------------------------------ */

export interface StudioInput {
  properties: unknown[];
  unitsByProperty: Record<number, unknown[]>;
  /** Null when the listings fetch failed — units/drafts still aggregate. */
  listings: unknown[] | null;
  drafts: ListingDraft[];
  now?: number;
}

export function aggregateStudioData(input: StudioInput): StudioData {
  const now = input.now ?? Date.now();
  const discarded = { properties: 0, units: 0, listings: 0 };

  const listingsByUnit = new Map<number, StudioListing>();
  if (input.listings !== null) {
    for (const raw of input.listings) {
      const row = asListingRow(raw);
      if (!row) {
        discarded.listings += 1;
        continue;
      }
      if (!listingsByUnit.has(row.rental_unit_id)) {
        listingsByUnit.set(row.rental_unit_id, normalizeListing(row));
      } else {
        discarded.listings += 1;
      }
    }
  }

  const properties: StudioProperty[] = [];
  for (const raw of input.properties) {
    const prop = asPropertyRow(raw);
    if (!prop) {
      discarded.properties += 1;
      continue;
    }
    const units: StudioUnit[] = [];
    for (const rawUnit of input.unitsByProperty[prop.id] ?? []) {
      const unit = asUnitRow(rawUnit);
      if (!unit) {
        discarded.units += 1;
        continue;
      }
      units.push({
        id: unit.id,
        propertyId: prop.id,
        unitType: unit.unit_type,
        layout: unit.layout,
        displayKind: displayKindFor(unit.unit_type, unit.layout),
        listing: listingsByUnit.get(unit.id) ?? null,
      });
    }
    properties.push({
      id: prop.id,
      propertyType: prop.property_type,
      name: prop.name,
      addressLine: prop.address_line,
      locality: prop.locality,
      city: prop.city,
      areaName: prop.areaName,
      units,
    });
  }

  const drafts = input.drafts.map(normalizeDraft);

  const allListings = properties.flatMap((p) =>
    p.units.flatMap((u) => (u.listing ? [{ listing: u.listing, unitId: u.id, propertyId: p.id }] : []))
  );
  const published = allListings.filter((l) => l.listing.lifecycle === "PUBLISHED");
  const paused = allListings.filter((l) => l.listing.lifecycle === "PAUSED");
  const draftListings = allListings.filter((l) => l.listing.lifecycle === "DRAFT");
  const pendingDrafts = drafts.filter((d) => d.kind === "pending");
  const localDrafts = drafts.filter((d) => d.kind === "local");

  const summary: StudioSummary = {
    propertyCount: properties.length,
    unitCount: properties.reduce((n, p) => n + p.units.length, 0),
    listingCount: allListings.length,
    publishedCount: published.length,
    pausedCount: paused.length,
    draftListingCount: draftListings.length,
    pendingCount: pendingDrafts.length,
    localDraftCount: localDrafts.length,
  };

  const availability = { availableNow: 0, availableFromDate: 0, occupied: 0 };
  for (const { listing } of allListings) {
    if (listing.availability.status === "AVAILABLE_NOW") availability.availableNow += 1;
    else if (listing.availability.status === "AVAILABLE_FROM_DATE") availability.availableFromDate += 1;
    else if (listing.availability.status === "OCCUPIED") availability.occupied += 1;
  }
  const missingPhotos = published.filter((l) => l.listing.photoCount === 0).length;
  const missingRent = published.filter((l) => l.listing.rent === null).length;
  const insights: StudioInsights = {
    availability,
    health: {
      published: published.length,
      paused: paused.length,
      draft: draftListings.length,
      missingPhotos,
      missingRent,
    },
  };

  // Attention, dashboard priority order: incomplete sends, then stale
  // drafts. Capped at MAX_ATTENTION. Deliberately NOT included:
  // published listings missing photos — the publish guard requires 3+
  // READY photos, so that state is unreachable through the product flow
  // and must never surface as something the owner should act on.
  // (insights.health.missingPhotos retains the raw observation.)
  const attention: StudioAttention[] = [];
  const byRecency = [...pendingDrafts].sort((a, b) => a.updatedAt - b.updatedAt);
  for (const d of byRecency) {
    attention.push({
      key: `send:${d.draftId}`,
      reason: "send-incomplete",
      priority: 1,
      draftId: d.draftId,
      listingId: d.backendIds.listingId,
      unitId: d.backendIds.unitId,
      propertyId: d.backendIds.propertyId,
      remainingSteps: d.remainingSteps,
      draftAgeDays: null,
    });
  }
  for (const d of localDrafts) {
    const ageDays = Math.floor((now - d.updatedAt) / (24 * 60 * 60 * 1000));
    if (now - d.updatedAt > STALE_DRAFT_MS) {
      attention.push({
        key: `stale:${d.draftId}`,
        reason: "stale-draft",
        priority: 2,
        draftId: d.draftId,
        listingId: null,
        unitId: null,
        propertyId: null,
        remainingSteps: [],
        draftAgeDays: ageDays,
      });
    }
  }
  attention.sort((a, b) => a.priority - b.priority);

  return {
    summary,
    properties,
    drafts,
    attention: attention.slice(0, MAX_ATTENTION),
    insights,
    errors: {
      listingsUnavailable: input.listings === null,
      unitsFailed: 0,
      discarded,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Fetch + aggregate (thin; reuses api.ts auth, no new client)          */
/* ------------------------------------------------------------------ */

export type StudioLoadStatus = "ok" | "auth-error" | "inventory-error";

export interface StudioLoadResult {
  status: StudioLoadStatus;
  data: StudioData;
  /** Raw backend detail for Phase H error UI. Null when healthy. */
  inventoryError: string | null;
}

export interface StudioLoadDeps {
  uid: string;
  fetchProperties?: () => Promise<unknown[]>;
  fetchUnits?: (propertyId: number) => Promise<unknown[]>;
  fetchListings?: () => Promise<unknown[] | null>;
  loadLocalDrafts?: (uid: string) => Record<string, ListingDraft>;
  now?: number;
}

function isAuthError(err: unknown): boolean {
  return err instanceof ApiError && err.isUnauthorized;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Request failed.";
}

/**
 * Load everything Owner Studio needs in one call. Local drafts are always
 * included — even when backend inventory fails — so the page can render
 * Continue/Retry from local state. No caching, no store, no framework.
 */
export async function loadStudioData(deps: StudioLoadDeps): Promise<StudioLoadResult> {
  const {
    uid,
    fetchProperties = listOwnerProperties,
    fetchUnits = listPropertyUnits,
    fetchListings = listOwnerListings,
    loadLocalDrafts = loadStoredDrafts,
    now,
  } = deps;

  let drafts: ListingDraft[] = [];
  try {
    drafts = Object.values(loadLocalDrafts(uid));
  } catch {
    drafts = [];
  }

  let properties: unknown[];
  try {
    properties = await fetchProperties();
    if (!Array.isArray(properties)) properties = [];
  } catch (err) {
    if (isAuthError(err)) {
      return {
        status: "auth-error",
        data: aggregateStudioData({ properties: [], unitsByProperty: {}, listings: [], drafts, now }),
        inventoryError: errorMessage(err),
      };
    }
    return {
      status: "inventory-error",
      data: aggregateStudioData({ properties: [], unitsByProperty: {}, listings: [], drafts, now }),
      inventoryError: errorMessage(err),
    };
  }

  const unitsByProperty: Record<number, unknown[]> = {};
  let unitsFailed = 0;
  let unitsAuthError: string | null = null;
  await Promise.all(
    properties.map(async (raw) => {
      if (unitsAuthError !== null) return;
      const prop = asPropertyRow(raw);
      if (!prop) return;
      try {
        const units = await fetchUnits(prop.id);
        unitsByProperty[prop.id] = Array.isArray(units) ? units : [];
      } catch (err) {
        if (isAuthError(err)) {
          unitsAuthError = errorMessage(err);
          return;
        }
        unitsFailed += 1;
        unitsByProperty[prop.id] = [];
      }
    })
  );
  if (unitsAuthError !== null) {
    return {
      status: "auth-error",
      data: aggregateStudioData({ properties: [], unitsByProperty: {}, listings: [], drafts, now }),
      inventoryError: unitsAuthError,
    };
  }

  let listings: unknown[] | null;
  let listingsUnavailable = false;
  try {
    const rows = await fetchListings();
    listings = Array.isArray(rows) ? rows : [];
  } catch (err) {
    if (isAuthError(err)) {
      return {
        status: "auth-error",
        data: aggregateStudioData({ properties: [], unitsByProperty: {}, listings: [], drafts, now }),
        inventoryError: errorMessage(err),
      };
    }
    listings = null;
    listingsUnavailable = true;
  }

  const data = aggregateStudioData({ properties, unitsByProperty, listings, drafts, now });
  data.errors.unitsFailed = unitsFailed;
  data.errors.listingsUnavailable = listingsUnavailable;
  return { status: "ok", data, inventoryError: null };
}
