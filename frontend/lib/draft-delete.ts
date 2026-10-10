import { deleteOwnerDraft } from "./api";

/**
 * Minimal deletion target. StudioDraft satisfies this shape; callers that
 * only know a backend listing (e.g. Your Places unit rows) construct it
 * from the listing id and lifecycle. Widened deliberately so no caller
 * needs to fabricate a full StudioDraft.
 */
export interface DeletableDraftTarget {
  backendIds: { listingId: number | null };
  linkedLifecycle: string | null;
}

export interface DeleteDraftGuard {
  readonly active: boolean;
  /** Returns false when a deletion is already running. */
  tryStart(): boolean;
  finish(): void;
}

/**
 * Single-flight guard for the delete action. The guard object is held by
 * the caller (a ref in practice): a second concurrent delete — double
 * click, keyboard re-trigger — gets `busy` instead of a second request.
 * A boolean flag alone cannot do this because React state has not flushed
 * on a same-tick second click.
 */
export function createDeleteDraftGuard(): DeleteDraftGuard {
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

export type DeleteDraftResult =
  | { ok: true; localOnly: boolean }
  | { ok: false; status?: number; error: string };

export type DeleteDraftOutcome =
  | { type: "busy" }
  | { type: "not-deletable" }
  | { type: "done"; result: DeleteDraftResult };

function statusOf(err: unknown): number | undefined {
  if (err instanceof Error && "status" in err) {
    const s = (err as Error & { status?: unknown }).status;
    return typeof s === "number" ? s : undefined;
  }
  return undefined;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : "Request failed.";
}

/**
 * Delete one dashboard draft. Never throws for guard/gate reasons (those
 * are outcomes); transport errors become failure results. The local draft
 * is removed ONLY after a successful backend deletion (or immediately
 * for local-only drafts, which have nothing on the backend). A linked
 * draft whose lifecycle is not DRAFT fails closed: no backend call, no
 * local removal. The backend DELETE endpoint remains the final authority;
 * this gate is UX-only.
 */
export async function runDeleteDraft(deps: {
  draft: DeletableDraftTarget;
  guard: DeleteDraftGuard;
  deleteListing?: (listingId: number) => Promise<null>;
  removeLocal: () => void;
}): Promise<DeleteDraftOutcome> {
  if (!deps.guard.tryStart()) return { type: "busy" };
  try {
    const listingId = deps.draft.backendIds.listingId;
    if (listingId === null) {
      deps.removeLocal();
      return { type: "done", result: { ok: true, localOnly: true } };
    }
    if (deps.draft.linkedLifecycle !== "DRAFT") return { type: "not-deletable" };
    const del = deps.deleteListing ?? deleteOwnerDraft;
    try {
      await del(listingId);
    } catch (err) {
      return {
        type: "done",
        result: { ok: false, status: statusOf(err), error: messageOf(err) },
      };
    }
    deps.removeLocal();
    return { type: "done", result: { ok: true, localOnly: false } };
  } finally {
    deps.guard.finish();
  }
}

/**
 * Backend failure -> owner-readable message. Every branch states
 * explicitly that nothing was deleted, so the owner knows the draft is
 * still there and a retry is safe.
 */
export function deleteDraftErrorMessage(
  outcome: { type: "not-deletable" } | Extract<DeleteDraftResult, { ok: false }>
): string {
  if ("type" in outcome)
    return (
      "This listing is no longer a draft, so it can't be deleted from " +
      "here. Nothing was deleted."
    );
  if (outcome.status === 401)
    return "Your session expired. Please sign in again, then retry — nothing was deleted.";
  if (outcome.status === 404)
    return (
      "We couldn't find that listing on Apun-Ghar — it may already be " +
      "gone. The draft is kept on this device; nothing was deleted."
    );
  if (outcome.status === 422)
    return (
      "This listing is no longer a draft, so it can't be deleted. " +
      "Nothing was deleted."
    );
  if (outcome.status === 503)
    return (
      "Apun-Ghar couldn't reach photo storage just now. Nothing was " +
      "deleted — please try again."
    );
  if (outcome.status === undefined)
    return (
      "Couldn't reach Apun-Ghar. Check your connection and try again — " +
      "nothing was deleted."
    );
  return `Couldn't delete the draft: ${outcome.error} Nothing was deleted.`;
}

/**
 * Find the local draft id whose backend listing matches, if any. Used
 * when deleting from a surface that acts on the backend listing (Your
 * Places): the companion local draft must be purged too, otherwise it
 * becomes an undeletable zombie pointing at a deleted listing.
 */
export function findLocalDraftIdByListingId(
  drafts: { draftId: string; backendIds: { listingId: number | null } }[],
  listingId: number
): string | null {
  const match = drafts.find((d) => d.backendIds.listingId === listingId);
  return match?.draftId ?? null;
}
