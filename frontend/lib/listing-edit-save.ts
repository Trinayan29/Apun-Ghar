/**
 * P2.3c Edit Listing save orchestrator. React-independent.
 *
 * Turns a P2.3b SavePlan (WHAT to persist) into sequenced mutations
 * (WHEN/HOW), with fail-stop partial failure, retry-from-failed-step,
 * authoritative reload, and a generation guard against edits made while
 * a save is in flight.
 *
 * Boundary (see P2.3c architecture audit):
 * - SavePlan is consumed as-is and never transformed or cached: every
 *   attempt (including retries) recomputes it from the current draft +
 *   fresh server context, so stale request bodies can never replay.
 * - The orchestrator never touches React state or localStorage. It
 *   returns the authoritative draft and an adoption verdict; the wizard
 *   persists the session. The single exception is nothing.
 * - Response bodies from PATCH/PUT/POST are ignored for state: only the
 *   authoritative reload (loadEditSource + hydrateEditDraft) may become
 *   the new draft/snapshot.
 */

import {
  apiGet,
  apiPatch,
  apiPost,
  apiPut,
  type OwnerListingItem,
} from "./api";
import {
  hydrateEditDraft,
  loadEditSource,
} from "./listing-edit";
import {
  planSave,
  type SaveContext,
  type SaveIssue,
} from "./listing-save";
import {
  validateForSubmit,
  type SubmitBlocker,
  type SubmitGuard,
} from "./listing-submit-action";
import type { Transport, SubmitStep } from "./listing-submit-flow";
import type { ListingDraft } from "./listing-draft";

/** Logical save steps. Reuses the create-flow vocabulary on purpose:
 *  the owner-facing language stays identical across flows. */
export type EditSaveStep = SubmitStep;

export const EDIT_SAVE_STEPS: EditSaveStep[] = [
  "property",
  "unit",
  "listing",
  "price",
  "availability",
];

export const EDIT_SAVE_STEP_LABELS: Record<EditSaveStep, string> = {
  property: "Property",
  unit: "Space",
  listing: "Listing",
  price: "Pricing",
  availability: "Availability",
};

export interface EditSaveIds {
  propertyId: number;
  unitId: number;
  listingId: number;
}

export type EditSaveProgressEvent =
  | { type: "plan"; steps: EditSaveStep[] }
  | { type: "step-start"; step: EditSaveStep }
  | { type: "step-done"; step: EditSaveStep };

export interface RunEditSaveDeps {
  draft: ListingDraft;
  snapshot: ListingDraft;
  ids: EditSaveIds;
  /** Session generation captured at save start (session.updatedAt). */
  generation: number;
  /** True when the diff carries rent/rental-type changes. */
  significant: boolean;
  /** True once the owner confirmed significant changes. */
  confirmed: boolean;
  /** Resume point for retries. Never a cached plan — see docs above. */
  fromStep?: EditSaveStep;
  /** Substep resume point inside the pricing branch (from failedDetail). */
  fromDetail?: "price-clear" | "price-full";
  transport?: Transport;
  guard?: SubmitGuard;
  /** Fresh server context (status + rent_basis). Defaults to a listing GET. */
  fetchContext?: (listingId: number) => Promise<SaveContext>;
  /** Authoritative session rebuild. Defaults to load + hydrate. */
  reloadDraft?: (listingId: number) => Promise<ListingDraft>;
  /** Live check the wizard owns: false when the session object moved. */
  isCurrent?: () => boolean;
  onProgress?: (event: EditSaveProgressEvent) => void;
}

export interface EditSaveSuccess {
  ok: true;
  /** Steps whose mutations completed in this attempt. */
  appliedSteps: EditSaveStep[];
  /** Authoritative post-save draft (adopted or not — see below). */
  freshDraft: ListingDraft;
  /** True only when the generation still matches: safe to adopt. */
  adopted: boolean;
  /** True when the server save completed but newer local edits exist.
   *  The caller must keep the local session and must NOT adopt. */
  staleLocalEdits: boolean;
  /** True when nothing needed sending (clean session guard). */
  noChanges: boolean;
}

export type EditSaveFailureReason =
  | "busy"
  | "invalid"
  | "plan-issues"
  | "confirm-required"
  | "context-failed"
  | "step-failed"
  | "reload-failed";

export interface EditSaveFailure {
  ok: false;
  reason: EditSaveFailureReason;
  /** Logical step that failed (step-failed only). */
  failedStep?: EditSaveStep;
  /** Substep detail inside the pricing branch ("price-clear"|"price-full"). */
  failedDetail?: "price-clear" | "price-full";
  /** True when a price-clear PUT succeeded in this attempt but the full
   *  pricing set was not restored (a later step failed). Pricing is then
   *  partially reset on the server: neither fully successful nor
   *  untouched. Never set alongside appliedSteps containing "price". */
  pricingCleared?: boolean;
  appliedSteps: EditSaveStep[];
  /** Logical steps never attempted (for honest UI copy). */
  pendingSteps: EditSaveStep[];
  error: string;
  status?: number;
  /** Validation blocker (invalid) or plan issues (plan-issues). */
  blocker?: SubmitBlocker;
  issues?: SaveIssue[];
  /** True for reload-failed: retry must confirm only, never mutate. */
  needsReloadOnly?: boolean;
  /** True for confirm-required. */
  significant?: boolean;
}

export type EditSaveOutcome = EditSaveSuccess | EditSaveFailure;

export interface ReloadConfirmDeps {
  listingId: number;
  generation: number;
  transport?: Transport;
  reloadDraft?: (listingId: number) => Promise<ListingDraft>;
  isCurrent?: () => boolean;
}

export type ReloadConfirmOutcome =
  | {
      ok: true;
      freshDraft: ListingDraft;
      adopted: boolean;
      staleLocalEdits: boolean;
    }
  | { ok: false; error: string };

const defaultTransport: Transport = <T>(
  path: string,
  body: unknown,
  method: "POST" | "PUT" | "GET" | "PATCH"
): Promise<T> => {
  if (method === "PUT") return apiPut<T>(path, body);
  if (method === "GET") return apiGet<T>(path);
  if (method === "PATCH") return apiPatch<T>(path, body);
  return apiPost<T>(path, body);
};

async function defaultFetchContext(
  listingId: number,
  transport: Transport
): Promise<SaveContext> {
  const row = await transport<OwnerListingItem>(
    `/api/v1/owner/listings/${listingId}`,
    undefined,
    "GET"
  );
  return { listingStatus: row.status, rentBasis: row.rent_basis };
}

async function defaultReloadDraft(listingId: number): Promise<ListingDraft> {
  return hydrateEditDraft(await loadEditSource(listingId));
}

function statusOf(err: unknown): number | undefined {
  if (err instanceof Error && "status" in err) {
    const s = (err as Error & { status?: unknown }).status;
    return typeof s === "number" ? s : undefined;
  }
  return undefined;
}

function messageOf(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/**
 * Backend failure -> owner-readable message. Always names the logical
 * step and says explicitly that earlier steps stayed saved, so the UI
 * never claims "nothing was saved" when something was.
 */
export function editSaveErrorMessage(
  step: EditSaveStep,
  err: unknown
): { error: string; status?: number } {
  const status = statusOf(err);
  const where = EDIT_SAVE_STEP_LABELS[step];
  if (status === 401)
    return {
      status,
      error:
        "Your session expired, so saving stopped at " +
        `${where}. Please sign in again, then retry — ` +
        "everything saved so far is kept.",
    };
  if (status === 403)
    return {
      status,
      error:
        `You no longer have permission to save ${where}. ` +
        "Your edits are kept — please contact support instead of retrying.",
    };
  if (status === 404)
    return {
      status,
      error:
        `The ${where.toLowerCase()} being saved was not found — it may have ` +
        "been removed or moved to another account. Your edits are kept; " +
        "going back to the Studio is the safe next step.",
    };
  if (status === 409)
    return {
      status,
      error:
        `Couldn't save ${where}: conflicting pricing data. ` +
        "Your edits are kept — please try again, and contact support " +
        "if it keeps happening.",
    };
  if (status === undefined)
    return {
      error:
        `Couldn't reach Apun-Ghar while saving ${where}. ` +
        "Check your connection and retry — everything saved so far is kept.",
    };
  return {
    status,
    error:
      `Couldn't save ${where}: ${messageOf(err, "request failed")} ` +
      "Everything saved so far is kept — fix the highlighted issue " +
      "and retry.",
  };
}

interface PlannedAction {
  step: EditSaveStep;
  /** Substep inside the pricing branch; undefined for ordinary steps. */
  detail?: "price-clear" | "price-full";
  run: () => Promise<void>;
}

/**
 * Run one save attempt: validate -> fresh ctx -> plan -> confirm gate ->
 * sequenced mutations -> authoritative reload -> adoption verdict.
 * Fail-stop: the first failing action ends the attempt with applied vs
 * pending steps reported. Pure except for the injected transport/loaders;
 * never touches React state or localStorage.
 */
export async function runEditSave(
  deps: RunEditSaveDeps
): Promise<EditSaveOutcome> {
  const transport = deps.transport ?? defaultTransport;
  if (deps.guard && !deps.guard.tryStart()) {
    return {
      ok: false,
      reason: "busy",
      appliedSteps: [],
      pendingSteps: [],
      error: "Already saving — try again in a moment.",
    };
  }
  try {
    const blocker = validateForSubmit(deps.draft);
    if (blocker !== null) {
      return {
        ok: false,
        reason: "invalid",
        blocker,
        appliedSteps: [],
        pendingSteps: [],
        error: blocker.message,
      };
    }

    let ctx: SaveContext;
    try {
      const fetchContext =
        deps.fetchContext ?? ((id: number) => defaultFetchContext(id, transport));
      ctx = await fetchContext(deps.ids.listingId);
    } catch (err) {
      const status = statusOf(err);
      return {
        ok: false,
        reason: "context-failed",
        appliedSteps: [],
        pendingSteps: [...EDIT_SAVE_STEPS],
        error:
          status === undefined
            ? "Couldn't reach Apun-Ghar. Check your connection and retry — nothing was sent."
            : `${messageOf(err, "Couldn't read the listing")} — nothing was sent yet.`,
        status,
      };
    }

    // Fresh plan every attempt (including retries): stale request bodies
    // can never replay, and user edits after a failure are picked up.
    const plan = planSave(deps.draft, deps.snapshot, ctx);
    if (plan.issues.length > 0) {
      return {
        ok: false,
        reason: "plan-issues",
        issues: plan.issues,
        appliedSteps: [],
        pendingSteps: plannedSteps(plan),
        error: plan.issues[0].message,
      };
    }
    if (deps.significant && !deps.confirmed) {
      return {
        ok: false,
        reason: "confirm-required",
        significant: true,
        appliedSteps: [],
        pendingSteps: plannedSteps(plan),
        error:
          "This includes rent or rental-type changes — please confirm them before saving.",
      };
    }

    const actions = buildActions(plan, deps, transport);
    if (actions.length === 0) {
      return {
        ok: true,
        appliedSteps: [],
        freshDraft: deps.snapshot,
        adopted: false,
        staleLocalEdits: false,
        noChanges: true,
      };
    }
    deps.onProgress?.({
      type: "plan",
      steps: actions.map((a) => a.step),
    });

    const rawStart = startActionIndex(actions, deps.fromStep, deps.fromDetail);
    // Resume safety: the cursor may only skip earlier actions when the
    // fresh plan says they are unnecessary (absent from the action list).
    // If any earlier action needs sending — e.g. the owner edited an
    // already-applied step after the failure — reset to the beginning
    // instead of silently dropping the new edit. Replay is safe: every
    // mutation is absolute/idempotent.
    let startIdx = rawStart;
    if (deps.fromStep !== undefined) {
      const fromOrder = EDIT_SAVE_STEPS.indexOf(deps.fromStep);
      const earlierNeeded = actions.some(
        (a, i) =>
          i < rawStart && EDIT_SAVE_STEPS.indexOf(a.step) < fromOrder
      );
      if (earlierNeeded) startIdx = 0;
    }
    const appliedSteps: EditSaveStep[] = [];
    // True once a price-clear PUT succeeded in this attempt without the
    // full set being restored afterwards (a later step failed). Used to
    // report the partially-reset pricing state honestly.
    let priceClearDone = false;
    const markDone = (step: EditSaveStep) => {
      if (appliedSteps[appliedSteps.length - 1] !== step)
        appliedSteps.push(step);
      deps.onProgress?.({ type: "step-done", step });
    };
    for (const [actionIdx, action] of actions.entries()) {
      if (actionIdx < startIdx) continue;
      deps.onProgress?.({ type: "step-start", step: action.step });
      try {
        await action.run();
      } catch (err) {
        const pricedOut = priceClearDone && !appliedSteps.includes("price");
        const base = editSaveErrorMessage(action.step, err);
        // Partially-reset pricing is neither applied nor unattempted: it
        // must not appear in appliedSteps (only a completed full set
        // counts) and must not appear in pendingSteps as ordinary
        // "not attempted" either — the flag + message carry its state.
        const pending = pendingAfter(plan, action.step);
        return {
          ok: false,
          reason: "step-failed",
          failedStep: action.step,
          failedDetail: action.detail,
          appliedSteps: [...appliedSteps],
          pendingSteps: pricedOut
            ? pending.filter((s) => s !== "price")
            : pending,
          error: pricedOut
            ? `${base.error} Pricing was already reset on the server and ` +
              "still needs to be restored — retry to restore it."
            : base.error,
          status: base.status,
          ...(pricedOut ? { pricingCleared: true as const } : {}),
        };
      }
      // The clear half of the pricing branch is a silent substep: only
      // a completed full set counts as applied Pricing.
      if (action.detail === "price-clear") {
        priceClearDone = true;
      } else {
        markDone(action.step);
      }
    }

    let freshDraft: ListingDraft;
    try {
      const reloadDraft =
        deps.reloadDraft ?? ((id: number) => defaultReloadDraft(id));
      freshDraft = await reloadDraft(deps.ids.listingId);
    } catch (err) {
      return {
        ok: false,
        reason: "reload-failed",
        appliedSteps: [...appliedSteps],
        pendingSteps: [],
        needsReloadOnly: true,
        error:
          "Your changes were saved, but we couldn't confirm the latest " +
          `server state (${messageOf(err, "reload failed")}). ` +
          "Retry the confirmation — nothing will be sent twice.",
        status: statusOf(err),
      };
    }

    const current = deps.isCurrent ? deps.isCurrent() : true;
    if (!current) {
      // The owner kept editing while the save ran: their newer draft
      // survives. The server save completed; the next review shows the
      // remaining diff honestly.
      return {
        ok: true,
        appliedSteps: [...appliedSteps],
        freshDraft,
        adopted: false,
        staleLocalEdits: true,
        noChanges: false,
      };
    }
    return {
      ok: true,
      appliedSteps: [...appliedSteps],
      freshDraft,
      adopted: true,
      staleLocalEdits: false,
      noChanges: false,
    };
  } finally {
    deps.guard?.finish();
  }
}

/** Logical steps with send === true, in execution order. */
function plannedSteps(plan: {
  property: { send: boolean };
  unit: { send: boolean };
  listing: { send: boolean };
  pricing: { send: boolean };
  availability: { send: boolean };
  rentBasisChanged: boolean;
}): EditSaveStep[] {
  const out: EditSaveStep[] = [];
  if (plan.property.send) out.push("property");
  if (plan.unit.send) out.push("unit");
  if (plan.listing.send) out.push("listing");
  if (plan.pricing.send || plan.rentBasisChanged) out.push("price");
  if (plan.availability.send) out.push("availability");
  return out;
}

/**
 * Resume index into the action list. Matches the exact failed action
 * (step + substep) so the rent-basis trio keeps its internal order:
 * retrying from a failed clear replays clear -> PATCH -> full, while
 * retrying from the listing step skips the already-cleared pricing.
 * When the failed step no longer sends (owner reverted it), execution
 * continues from the next applicable action.
 */
function startActionIndex(
  actions: { step: EditSaveStep; detail?: string }[],
  fromStep: EditSaveStep | undefined,
  fromDetail: string | undefined
): number {
  if (fromStep === undefined) return 0;
  const exact = actions.findIndex(
    (a) =>
      a.step === fromStep && (a.detail ?? null) === (fromDetail ?? null)
  );
  if (exact >= 0) return exact;
  const sameStep = actions.findIndex((a) => a.step === fromStep);
  if (sameStep >= 0) return sameStep;
  const fromIdx = EDIT_SAVE_STEPS.indexOf(fromStep);
  const next = actions.findIndex(
    (a) => EDIT_SAVE_STEPS.indexOf(a.step) > fromIdx
  );
  return next >= 0 ? next : actions.length;
}

/** Logical steps after the failed one that still need sending. */
function pendingAfter(
  plan: Parameters<typeof plannedSteps>[0],
  failedStep: EditSaveStep
): EditSaveStep[] {
  const idx = EDIT_SAVE_STEPS.indexOf(failedStep);
  return plannedSteps(plan).filter(
    (s) => EDIT_SAVE_STEPS.indexOf(s) > idx
  );
}

function buildActions(
  plan: {
    property: { send: boolean; body: unknown };
    unit: { send: boolean; body: unknown };
    listing: { send: boolean; body: unknown };
    pricing: { send: boolean; body: unknown };
    availability: { send: boolean; body: unknown };
    rentBasisChanged: boolean;
  },
  deps: RunEditSaveDeps,
  transport: Transport
): PlannedAction[] {
  const { ids } = deps;
  const actions: PlannedAction[] = [];
  if (plan.property.send) {
    actions.push({
      step: "property",
      run: () =>
        transport<unknown>(
          `/api/v1/owner/properties/${ids.propertyId}`,
          plan.property.body,
          "PATCH"
        ).then(() => undefined),
    });
  }
  if (plan.unit.send) {
    actions.push({
      step: "unit",
      run: () =>
        transport<unknown>(
          `/api/v1/owner/units/${ids.unitId}`,
          plan.unit.body,
          "PATCH"
        ).then(() => undefined),
    });
  }
  // Rent-basis change: the clear must run BEFORE the listing PATCH that
  // moves the basis (the backend rejects a basis move while old-basis
  // RENT rows exist), and the full PUT must run right after — back to
  // back, exposed to the UI as one logical Pricing step.
  if (plan.rentBasisChanged) {
    actions.push({
      step: "price",
      detail: "price-clear",
      run: () =>
        transport<unknown>(
          `/api/v1/owner/listings/${ids.listingId}/price-components`,
          [],
          "PUT"
        ).then(() => undefined),
    });
  }
  if (plan.listing.send) {
    actions.push({
      step: "listing",
      run: () =>
        transport<unknown>(
          `/api/v1/owner/listings/${ids.listingId}`,
          plan.listing.body,
          "PATCH"
        ).then(() => undefined),
    });
  }
  if (plan.rentBasisChanged || plan.pricing.send) {
    actions.push({
      step: "price",
      detail: plan.rentBasisChanged ? "price-full" : undefined,
      run: () =>
        transport<unknown>(
          `/api/v1/owner/listings/${ids.listingId}/price-components`,
          plan.pricing.body,
          "PUT"
        ).then(() => undefined),
    });
  }
  if (plan.availability.send) {
    actions.push({
      step: "availability",
      run: () =>
        transport<unknown>(
          `/api/v1/owner/listings/${ids.listingId}/availability`,
          plan.availability.body,
          "POST"
        ).then(() => undefined),
    });
  }
  return actions;
}

/**
 * Reload-only retry after a reload-failed outcome. Never mutates: it
 * rebuilds the authoritative draft and returns the same adoption
 * verdict as a full save, so the wizard can share one adoption path.
 */
export async function confirmEditSaveReload(
  deps: ReloadConfirmDeps
): Promise<ReloadConfirmOutcome> {
  const reloadDraft =
    deps.reloadDraft ?? ((id: number) => defaultReloadDraft(id));
  let freshDraft: ListingDraft;
  try {
    freshDraft = await reloadDraft(deps.listingId);
  } catch (err) {
    return {
      ok: false,
      error:
        "Still couldn't confirm the server state " +
        `(${messageOf(err, "reload failed")}). Your changes stayed saved — try again.`,
    };
  }
  const current = deps.isCurrent ? deps.isCurrent() : true;
  return {
    ok: true,
    freshDraft,
    adopted: current,
    staleLocalEdits: !current,
  };
}
