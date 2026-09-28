/**
 * Owner wizard -> submitListingDraft() wiring (Phase 4E-3, UI wiring only).
 *
 * The Publish chapter's send action runs through this module:
 *
 *   validateForSubmit(draft)   all chapter validators, first failure wins
 *     -> runSubmitAction()     single-flight guard + submit + persist
 *
 * No UI framework here: the page owns React state (sending flag, error
 * text, confirmation) and passes a guard + persist callback in. That keeps
 * every decision — validation gating, exactly-once invocation, persisting
 * ids/progress on BOTH success and failure — unit-testable under the
 * existing node harness. Rendering (loading/error/retry affordances) is
 * thin glue in the page + PublishChapter.
 *
 * Out of scope: photo uploads, real backend publish, amenity catalog,
 * H2 idempotency, H3 409 adoption.
 */

import {
  ensureDraftListing,
  submitListingDraft,
  type SubmitResult,
  type SubmitStep,
  type Transport,
} from "./listing-submit-flow";
import {
  normalizeBackendId,
  validateChooseProperty,
  validateKind,
  validateMoveIn,
  validateName,
  validatePhotos,
  validatePlaceName,
  validatePrice,
  validateSpace,
  validateWhat,
  validateWhere,
  validateWho,
  type BackendIds,
  type ChapterId,
  type ListingDraft,
  type SubmitProgress,
} from "./listing-draft";

export interface SubmitBlocker {
  step: ChapterId;
  message: string;
}

/**
 * Run every chapter validator in wizard order; the first failure wins so
 * the UI can jump the owner straight to the offending step. Amenity
 * selection ("included") has no validator — amenities are optional.
 */
export function validateForSubmit(draft: ListingDraft): SubmitBlocker | null {
  // An existing property's Where/Name answers are authoritative backend
  // data, not user input: skip those validators like the locked chapters do.
  const lockedPlace = draft.propertySource === "existing";
  const checks: [ChapterId, string | null][] = [
    ["what", validateWhat(draft.space)],
    ["kind", validateKind(draft.place)],
    ["chooseproperty", validateChooseProperty(draft)],
    ["where", lockedPlace ? null : validateWhere(draft.place)],
    ["placename", lockedPlace ? null : validatePlaceName(draft.place)],
    ["space", validateSpace(draft.space)],
    ["who", validateWho(draft.space, draft.place)],
    ["photos", validatePhotos(draft.photos)],
    ["price", validatePrice(draft.pricing)],
    ["movein", validateMoveIn(draft.availability)],
    ["name", validateName(draft.listing)],
  ];
  for (const [step, message] of checks) {
    if (message !== null) return { step, message };
  }
  return null;
}

/**
 * Draft-save validation: only the chapters answered before SHOW THE PLACE.
 * Price, move-in, name (and photos count) are deliberately unchecked — an
 * incomplete backend DRAFT is the whole point. Publication still requires
 * the full validateForSubmit path at send time.
 */
export function validateForDraftSave(draft: ListingDraft): SubmitBlocker | null {
  const lockedPlace = draft.propertySource === "existing";
  const checks: [ChapterId, string | null][] = [
    ["what", validateWhat(draft.space)],
    ["kind", validateKind(draft.place)],
    ["chooseproperty", validateChooseProperty(draft)],
    ["where", lockedPlace ? null : validateWhere(draft.place)],
    ["placename", lockedPlace ? null : validatePlaceName(draft.place)],
    ["space", validateSpace(draft.space)],
    ["who", validateWho(draft.space, draft.place)],
  ];
  for (const [step, message] of checks) {
    if (message !== null) return { step, message };
  }
  return null;
}

export type EnsureActionOutcome =
  | { type: "invalid"; blocker: SubmitBlocker }
  | { type: "busy" }
  | {
      type: "done";
      ids: BackendIds;
      /** Preformatted failure (validation never reaches here as error). */
      error: string | null;
    };

/**
 * Validate-for-draft-save, then ensure backend ids exactly once. Persists
 * ids on BOTH success and failure so retries resume. Validation failures
 * surface the real blocker message — never a network error.
 */
export async function ensureDraftListingIds(deps: {
  draft: ListingDraft;
  guard: SubmitGuard;
  transport?: Transport;
  persist: (ids: BackendIds) => void;
}): Promise<EnsureActionOutcome> {
  const blocker = validateForDraftSave(deps.draft);
  if (blocker !== null) return { type: "invalid", blocker };
  if (!deps.guard.tryStart()) return { type: "busy" };
  try {
    const result = await ensureDraftListing(deps.draft, deps.transport);
    deps.persist(result.ids);
    if (!result.ok) {
      return {
        type: "done",
        ids: result.ids,
        error: submitErrorMessage({
          ok: false,
          ids: result.ids,
          progress: deps.draft.submitProgress,
          failedStep: result.failedStep,
          status: result.status,
          error: result.error,
        }),
      };
    }
    return { type: "done", ids: result.ids, error: null };
  } finally {
    deps.guard.finish();
  }
}

export type EnsureListingResult =
  | { ok: true; listingId: number }
  | { ok: false; message: string };

/**
 * Page-framework-free ensure: same contract the wizard uses, without React.
 * The listing id comes from the ensure outcome itself — never from an
 * immediate store re-read, which stays stale under batched persistence
 * (React setState) even after a successful persist.
 */
export async function ensureListingIdForDraft(deps: {
  draft: ListingDraft;
  guard: SubmitGuard;
  transport?: Transport;
  persist: (ids: BackendIds) => void;
}): Promise<EnsureListingResult> {
  const existing = normalizeBackendId(deps.draft.backendIds?.listingId);
  if (existing != null) return { ok: true, listingId: existing };
  const outcome = await ensureDraftListingIds(deps);
  if (outcome.type === "busy")
    return { ok: false, message: "Already saving — try again in a moment." };
  if (outcome.type === "invalid")
    return { ok: false, message: outcome.blocker.message };
  if (outcome.error !== null) return { ok: false, message: outcome.error };
  const created = normalizeBackendId(outcome.ids.listingId);
  if (created == null)
    return { ok: false, message: "Couldn't save the draft — try again." };
  return { ok: true, listingId: created };
}

export interface SubmitGuard {
  readonly active: boolean;
  /** Returns false when a submission is already running. */
  tryStart(): boolean;
  finish(): void;
}

/**
 * Single-flight guard for the send action. The page holds one guard per
 * wizard mount (useRef): a second concurrent send — double-click, keyboard
 * re-trigger — gets `busy` instead of a second network submission.
 */
export function createSubmitGuard(): SubmitGuard {
  let active = false;
  return {
    get active() {
      return active;
    },
    tryStart() {
      if (active) return false;
      active = true;
      return true;
    },
    finish() {
      active = false;
    },
  };
}

export type SubmitActionOutcome =
  | { type: "invalid"; blocker: SubmitBlocker }
  | { type: "busy" }
  | { type: "done"; result: SubmitResult };

/**
 * Validate, then submit exactly once, then persist. The persist callback
 * runs on BOTH success and failure so partial ids/progress survive and a
 * retry resumes from the first incomplete step. Never throws for
 * validation/guard reasons (those are outcomes); transport errors are
 * already converted to failure results by submitListingDraft.
 */
export async function runSubmitAction(deps: {
  draft: ListingDraft;
  guard: SubmitGuard;
  transport?: Transport;
  persist: (ids: BackendIds, progress: SubmitProgress) => void;
}): Promise<SubmitActionOutcome> {
  const blocker = validateForSubmit(deps.draft);
  if (blocker !== null) return { type: "invalid", blocker };
  if (!deps.guard.tryStart()) return { type: "busy" };
  try {
    const result = await submitListingDraft(deps.draft, deps.transport);
    deps.persist(result.ids, result.progress);
    return { type: "done", result };
  } finally {
    deps.guard.finish();
  }
}

const STEP_LABELS: Record<SubmitStep, string> = {
  property: "property details",
  unit: "room details",
  listing: "listing details",
  price: "pricing",
  availability: "availability",
};

/**
 * Backend failure -> owner-readable message. Always names the step, keeps
 * the backend detail when there is one, and says explicitly that saved
 * progress is kept and retry won't repeat completed steps.
 */
export function submitErrorMessage(
  result: Extract<SubmitResult, { ok: false }>
): string {
  if (result.status === 401)
    return "Your session expired. Please sign in again, then retry — your saved progress is kept.";
  const where = STEP_LABELS[result.failedStep];
  if (result.status === undefined)
    return (
      `Couldn't reach Apun-Ghar while saving ${where}. ` +
      "Check your connection and retry — completed steps won't repeat."
    );
  if (result.failedStep === "listing" && result.status === 409)
    return (
      "This room already has a listing on Apun-Ghar, so we stopped here. " +
      "Your progress is saved — please contact support instead of retrying."
    );
  return (
    `Couldn't save ${where}: ${result.error} ` +
    "Your progress is saved — retry to continue from where it stopped."
  );
}

/**
 * Success confirmation. Honest about what happened: details are stored as
 * a backend draft (NOT visible to renters, NOT published), and pending
 * amenities are named rather than claimed as saved.
 */
export function submitSuccessMessage(
  result: Extract<SubmitResult, { ok: true }>
): string {
  const base =
    "Sent to Apun-Ghar and saved as a draft — renters can't see it yet. " +
    "Photos and final publishing come next.";
  if (result.pendingAmenitySlugs.length === 0) return base;
  const n = result.pendingAmenitySlugs.length;
  return (
    `${base} Note: ${n} selected ${n === 1 ? "amenity" : "amenities"} ` +
    "couldn't be attached yet and will be added before publishing."
  );
}
