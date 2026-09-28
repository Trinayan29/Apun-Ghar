/**
 * Owner wizard -> real backend: Property -> Unit -> Listing -> Price ->
 * Availability.
 *
 * Orchestrates the existing serializers (listing-submit.ts) against the
 * existing owner endpoints. No UI, no state management here: the caller
 * passes the draft in, gets backend ids + progress (or a tagged failure)
 * back, and persists them into the draft itself.
 *
 * Idempotency design (duplicate prevention):
 * - The draft carries `backendIds` (persisted per UID in localStorage).
 * - Every creation step first checks its id: present -> skip entirely.
 * - Price/availability attach to the listing (no separate ids), so the
 *   draft carries `submitProgress` completion markers for them; completed
 *   steps are skipped on retry. (PUT price-components is additionally a
 *   bulk replace, so a repeated PUT could not duplicate rows anyway.)
 * - A retry after failure therefore resumes from the first incomplete
 *   step instead of recreating earlier resources.
 * - Listing creation is recoverable: a 409 means the unit already has an
 *   active listing, which may be this draft's own row from a lost
 *   response. The flow looks it up and adopts it only under strict
 *   guards (own listing, fresh DRAFT, empty, content-matching) —
 *   otherwise the 409 stays terminal. Never POSTs twice.
 * - A fully-submitted draft performs zero network calls.
 *
 * Explicitly OUT of scope for this step (later phases):
 * photo uploads, publish.
 */

import { apiGet, apiPatch, apiPost, apiPut } from "./api";
import {
  describeAmenities,
  serializeAvailability,
  serializeDraftListing,
  serializeListing,
  serializePriceComponents,
  serializeProperty,
  serializeUnit,
  type AvailabilityPayload,
  type ListingPayload,
  type PriceComponentPayload,
  type PropertyPayload,
  type RentalUnitPayload,
} from "./listing-submit";
import type { BackendIds, ListingDraft, SubmitProgress } from "./listing-draft";

export type SubmitStep =
  | "property"
  | "unit"
  | "listing"
  | "price"
  | "availability";

export interface IdResponse {
  id: number;
}

/**
 * Transport shape. Defaults to the authenticated apiPost/apiPut/apiGet;
 * tests inject fakes. Existing fewer-arg fakes keep working (fewer
 * parameters are assignable).
 */
export type Transport = <T>(
  path: string,
  body: unknown,
  method: "POST" | "PUT" | "GET" | "PATCH"
) => Promise<T>;

const defaultTransport: Transport = <T>(
  path: string,
  body: unknown,
  method: "POST" | "PUT" | "GET" | "PATCH"
) => {
  if (method === "PUT") return apiPut<T>(path, body);
  if (method === "GET") return apiGet<T>(path);
  if (method === "PATCH") return apiPatch<T>(path, body);
  return apiPost<T>(path, body);
};

export interface SubmitSuccess {
  ok: true;
  ids: BackendIds;
  /** Completion markers the caller persists alongside the ids. */
  progress: SubmitProgress;
  /**
   * Owner-selected amenity slugs NOT sent to the backend: no amenity
   * catalog endpoint exists yet to resolve slug -> amenity_ids, so the
   * unit is created amenity-free and these stay pending in the draft for
   * a later attach phase (PATCH /api/v1/owner/units/{id}).
   */
  pendingAmenitySlugs: string[];
  /** Owner-selected labels with no known catalog slug. Never sent. */
  unknownAmenityLabels: string[];
}

export interface SubmitFailure {
  ok: false;
  ids: BackendIds;
  /** Progress as of the failure (completed steps stay completed). */
  progress: SubmitProgress;
  failedStep: SubmitStep;
  /** Human-readable backend detail (or status text) for UI display. */
  error: string;
  /** HTTP status when the failure came from the API (undefined on network failure). */
  status?: number;
}

export type SubmitResult = SubmitSuccess | SubmitFailure;

function failure(
  ids: BackendIds,
  progress: SubmitProgress,
  failedStep: SubmitStep,
  err: unknown
): SubmitFailure {
  if (err instanceof Error && "status" in err) {
    const withStatus = err as Error & { status?: unknown; message: string };
    return {
      ok: false,
      ids,
      progress,
      failedStep,
      error: withStatus.message || "Request failed.",
      status:
        typeof withStatus.status === "number" ? withStatus.status : undefined,
    };
  }
  return {
    ok: false,
    ids,
    progress,
    failedStep,
    error: err instanceof Error ? err.message : "Network request failed.",
  };
}

/**
 * Recovery window for 409 listing adoption. Only listings created minutes
 * ago qualify: long enough to cover a lost response + human-speed retry,
 * short enough that a genuinely pre-existing listing never qualifies.
 */
export const LISTING_RECOVERY_WINDOW_MS = 30 * 60 * 1000;

/** Tolerance for server/client clock skew on the recency check. */
const RECOVERY_FUTURE_TOLERANCE_MS = 60 * 1000;

/**
 * Minimal shape the 409-recovery lookup needs from GET /owner/listings.
 * Structural (not the full ListingRead): extra fields are ignored.
 */
export interface RecoveryCandidate {
  id: number;
  rental_unit_id: number;
  title: string;
  rent_basis: string;
  status: string;
  price_components: unknown[];
  photos: unknown[];
  created_at: string;
}

/**
 * Find an adoptable listing among lookup rows. Returns the id, or null
 * when nothing qualifies (caller keeps the terminal 409). Every guard
 * must pass: same unit, DRAFT, no prices, no photos, content matches this
 * draft's payload, created inside the recovery window. The lookup
 * endpoint is owner-scoped server-side, so cross-owner adoption is
 * impossible by query design.
 */
export function findAdoptableListing(
  rows: RecoveryCandidate[],
  unitId: number,
  expected: { title: string; rent_basis: string },
  nowMs: number = Date.now()
): number | null {
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    if (
      typeof row.id !== "number" ||
      !Number.isInteger(row.id) ||
      row.id <= 0
    )
      continue;
    if (row.rental_unit_id !== unitId) continue;
    if (row.status !== "DRAFT") continue;
    if (!Array.isArray(row.price_components) || row.price_components.length > 0)
      continue;
    if (!Array.isArray(row.photos) || row.photos.length > 0) continue;
    if (row.title !== expected.title || row.rent_basis !== expected.rent_basis)
      continue;
    const createdMs = Date.parse(row.created_at);
    if (!Number.isFinite(createdMs)) continue;
    const ageMs = nowMs - createdMs;
    if (ageMs > LISTING_RECOVERY_WINDOW_MS || ageMs < -RECOVERY_FUTURE_TOLERANCE_MS)
      continue;
    return row.id;
  }
  return null;
}

function isConflict(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err as Error & { status?: unknown }).status === 409
  );
}

/**
 * Recover a lost listing-create response: fetch this owner's listings for
 * the unit (server-side `rental_unit_id` filter, owner-scoped) and adopt
 * the row when the guards pass. Returns null on any lookup failure or
 * guard mismatch — the caller then keeps the terminal 409. Never POSTs.
 */
async function tryAdoptListing(
  transport: Transport,
  unitId: number,
  payload: ListingPayload
): Promise<number | null> {
  let rows: RecoveryCandidate[];
  try {
    rows = await transport<RecoveryCandidate[]>(
      `/api/v1/owner/listings?rental_unit_id=${unitId}`,
      undefined,
      "GET"
    );
  } catch {
    return null;
  }
  if (!Array.isArray(rows)) return null;
  return findAdoptableListing(
    rows,
    unitId,
    { title: payload.title, rent_basis: payload.rent_basis }
  );
}

/**
 * Submit Property -> RentalUnit -> Listing -> Price -> Availability for a
 * validated draft, skipping any step already recorded in the draft
 * (backendIds for creations, submitProgress for the id-tied steps).
 */
export async function submitListingDraft(
  draft: ListingDraft,
  transport: Transport = defaultTransport
): Promise<SubmitResult> {
  const ids: BackendIds = { ...draft.backendIds };
  const progress: SubmitProgress = { ...draft.submitProgress };

  if (ids.propertyId === null) {
    const payload: PropertyPayload = serializeProperty(draft);
    try {
      const created = await transport<IdResponse>(
        "/api/v1/owner/properties",
        payload,
        "POST"
      );
      ids.propertyId = created.id;
    } catch (err) {
      return failure(ids, progress, "property", err);
    }
  }

  if (ids.unitId === null) {
    // No catalog source in this phase: unit is created without amenities.
    const payload: RentalUnitPayload = serializeUnit(draft);
    try {
      const created = await transport<IdResponse>(
        `/api/v1/owner/properties/${ids.propertyId as number}/units`,
        payload,
        "POST"
      );
      ids.unitId = created.id;
    } catch (err) {
      return failure(ids, progress, "unit", err);
    }
  }

  if (ids.listingId === null) {
    const payload: ListingPayload = serializeListing(
      draft,
      ids.unitId as number
    );
    try {
      const created = await transport<IdResponse>(
        "/api/v1/owner/listings",
        payload,
        "POST"
      );
      ids.listingId = created.id;
    } catch (err) {
      // Single POST only: a 409 may be this draft's own row from a lost
      // response, so attempt guarded adoption instead of a second POST.
      // Any other error — or a failed adoption — stays terminal.
      if (!isConflict(err)) return failure(ids, progress, "listing", err);
      const adopted = await tryAdoptListing(
        transport,
        ids.unitId as number,
        payload
      );
      if (adopted === null) return failure(ids, progress, "listing", err);
      ids.listingId = adopted;
    }
  }

  // Reconcile early draft-save rows with the current answers. An ensure
  // may have created property/unit/listing from earlier chapters (with a
  // placeholder title); the full send always syncs them to the final
  // values. All three PATCHes are idempotent full-replaces, and price is
  // synced after the listing basis so its validation still applies.
  try {
    await transport<unknown>(
      `/api/v1/owner/properties/${ids.propertyId as number}`,
      serializeProperty(draft),
      "PATCH"
    );
  } catch (err) {
    return failure(ids, progress, "property", err);
  }
  try {
    await transport<unknown>(
      `/api/v1/owner/units/${ids.unitId as number}`,
      serializeUnit(draft),
      "PATCH"
    );
  } catch (err) {
    return failure(ids, progress, "unit", err);
  }
  try {
    const full: ListingPayload = serializeListing(draft, ids.unitId as number);
    await transport<unknown>(
      `/api/v1/owner/listings/${ids.listingId as number}`,
      {
        title: full.title,
        description: full.description,
        rent_basis: full.rent_basis,
      },
      "PATCH"
    );
  } catch (err) {
    return failure(ids, progress, "listing", err);
  }

  if (!progress.price) {
    // Bulk replace: the full serializer output becomes the listing's
    // price set. Never partially applied — success marks complete.
    const payload: PriceComponentPayload[] = serializePriceComponents(draft);
    try {
      await transport<unknown>(
        `/api/v1/owner/listings/${ids.listingId as number}/price-components`,
        payload,
        "PUT"
      );
      progress.price = true;
    } catch (err) {
      return failure(ids, progress, "price", err);
    }
  }

  if (!progress.availability) {
    const payload: AvailabilityPayload = serializeAvailability(
      draft.availability
    );
    try {
      await transport<unknown>(
        `/api/v1/owner/listings/${ids.listingId as number}/availability`,
        payload,
        "POST"
      );
      progress.availability = true;
    } catch (err) {
      return failure(ids, progress, "availability", err);
    }
  }

  const { slugs: pendingAmenitySlugs, unknownLabels: unknownAmenityLabels } =
    describeAmenities(draft);
  return { ok: true, ids, progress, pendingAmenitySlugs, unknownAmenityLabels };
}

// Re-export payload types so integration phases import from one place.
export type {
  AvailabilityPayload,
  ListingPayload,
  PriceComponentPayload,
  PropertyPayload,
  RentalUnitPayload,
};

export type EnsureResult =
  | { ok: true; ids: BackendIds }
  | {
      ok: false;
      ids: BackendIds;
      failedStep: SubmitStep;
      error: string;
      status?: number;
    };

/**
 * Early draft-save creation for the photos chapter: Property -> RentalUnit
 * -> Listing only, validated by validateForDraftSave (never price/move-in/
 * name). The listing carries a unique placeholder title + derived-or-
 * default rent_basis/availability; the full send later syncs every row to
 * the final answers. Skips steps already recorded (idempotent across
 * retries/reloads); price/availability progress flags are never touched.
 */
export async function ensureDraftListing(
  draft: ListingDraft,
  transport: Transport = defaultTransport
): Promise<EnsureResult> {
  const ids: BackendIds = { ...draft.backendIds };

  if (ids.propertyId === null) {
    const payload: PropertyPayload = serializeProperty(draft);
    try {
      const created = await transport<IdResponse>(
        "/api/v1/owner/properties",
        payload,
        "POST"
      );
      ids.propertyId = created.id;
    } catch (err) {
      const f = failure(ids, draft.submitProgress, "property", err);
      return { ok: false, ids: f.ids, failedStep: f.failedStep, error: f.error, status: f.status };
    }
  }

  if (ids.unitId === null) {
    const payload: RentalUnitPayload = serializeUnit(draft);
    try {
      const created = await transport<IdResponse>(
        `/api/v1/owner/properties/${ids.propertyId as number}/units`,
        payload,
        "POST"
      );
      ids.unitId = created.id;
    } catch (err) {
      const f = failure(ids, draft.submitProgress, "unit", err);
      return { ok: false, ids: f.ids, failedStep: f.failedStep, error: f.error, status: f.status };
    }
  }

  if (ids.listingId === null) {
    const payload: ListingPayload = serializeDraftListing(
      draft,
      ids.unitId as number
    );
    try {
      const created = await transport<IdResponse>(
        "/api/v1/owner/listings",
        payload,
        "POST"
      );
      ids.listingId = created.id;
    } catch (err) {
      if (!isConflict(err)) {
        const f = failure(ids, draft.submitProgress, "listing", err);
        return { ok: false, ids: f.ids, failedStep: f.failedStep, error: f.error, status: f.status };
      }
      const adopted = await tryAdoptListing(
        transport,
        ids.unitId as number,
        payload
      );
      if (adopted === null) {
        const f = failure(ids, draft.submitProgress, "listing", err);
        return { ok: false, ids: f.ids, failedStep: f.failedStep, error: f.error, status: f.status };
      }
      ids.listingId = adopted;
    }
  }

  return { ok: true, ids };
}
