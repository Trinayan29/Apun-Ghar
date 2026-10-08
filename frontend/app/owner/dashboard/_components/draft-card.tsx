import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BuildingIcon } from "@/components/owner-ui";
import {
  deleteDraftErrorMessage,
  type DeleteDraftOutcome,
} from "@/lib/draft-delete";
import type { StudioDraft } from "@/lib/studio-data";

/**
 * Single resumable draft card (Phase D). Read-only presentation over
 * StudioDraft: title with honest fallback, kind-derived state, relative
 * recency from the existing updatedAt, and a Continue link into the
 * existing wizard. No fetching, no mutations, no new draft creation.
 *
 * Delete (Phase 2.1): an overflow menu offers "Delete draft" for local
 * drafts and drafts linked to a DRAFT backend listing. Anything else
 * (PUBLISHED/PAUSED/RENTED/ARCHIVED/unknown) gets no menu — the backend
 * DELETE endpoint remains the final authority; this gate is UX-only.
 * Deletion runs through the injected onDelete callback; the card never
 * calls the API or the store directly.
 */

function formatRecency(updatedAt: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - updatedAt) / 60000);
  if (minutes < 1) return "Updated just now";
  if (minutes < 60) return `Updated ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Updated ${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Updated yesterday";
  return `Updated ${days} days ago`;
}

function canOfferDelete(draft: StudioDraft): boolean {
  if (draft.backendIds.listingId === null) return true;
  return draft.linkedLifecycle === "DRAFT";
}

export function DraftCard({
  draft,
  onDelete,
}: {
  draft: StudioDraft;
  /** Delete wiring; when absent, the card renders without the menu. */
  onDelete?: (draft: StudioDraft) => Promise<DeleteDraftOutcome>;
}) {
  const title = draft.title ?? "Untitled listing";
  const state = draft.kind === "pending" ? "In progress" : "Draft";
  const deletable = onDelete !== undefined && canOfferDelete(draft);

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Synchronous single-flight guard (mirrors ListingLifecycleAction):
  // React state hasn't flushed on a same-tick second click, so the ref —
  // set before the callback runs, cleared in `finally` — is what actually
  // prevents a duplicate deletion. `deleting` remains purely for UI.
  const deleteRef = useRef(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuItemRef = useRef<HTMLButtonElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Outside-click and Escape close the menu; Escape returns focus.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  // Move focus into the open menu, and into the confirmation.
  useEffect(() => {
    if (menuOpen) menuItemRef.current?.focus();
  }, [menuOpen]);
  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);

  const openConfirm = () => {
    setMenuOpen(false);
    setError(null);
    setConfirming(true);
  };
  const closeConfirm = () => {
    setConfirming(false);
    setError(null);
    menuButtonRef.current?.focus();
  };

  const runDelete = async () => {
    if (!onDelete || deleteRef.current) return;
    deleteRef.current = true;
    setDeleting(true);
    setError(null);
    try {
      const outcome = await onDelete(draft);
      if (outcome.type === "busy") return;
      if (outcome.type === "not-deletable") {
        setError(deleteDraftErrorMessage(outcome));
        return;
      }
      if (!outcome.result.ok) {
        setError(deleteDraftErrorMessage(outcome.result));
        return;
      }
      // Success: the parent refreshes and this card unmounts. Reset
      // defensively in case the draft somehow remains visible.
      setConfirming(false);
    } finally {
      deleteRef.current = false;
      setDeleting(false);
    }
  };

  return (
    <article className="rounded-2xl border border-line bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <span
          aria-hidden
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"
        >
          <BuildingIcon />
        </span>
        <div className="min-w-0 flex-1">
          <h2
            className="truncate text-[15px] font-bold tracking-tight"
            title={title}
          >
            {title}
          </h2>
          <p className="mt-0.5 truncate text-[13.5px] text-muted">
            {state} · {formatRecency(draft.updatedAt, Date.now())}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {deletable && (
            <div className="relative shrink-0" ref={menuRef}>
              <button
                type="button"
                ref={menuButtonRef}
                onClick={() => setMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label={`More actions for ${title}`}
                className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl border border-line bg-white text-ink transition active:scale-[0.98]"
              >
                <span aria-hidden className="text-[20px] font-bold leading-none">
                  ⋯
                </span>
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  aria-label={`Actions for ${title}`}
                  className="absolute right-0 top-full z-30 mt-2 min-w-[180px] rounded-xl border border-line bg-white p-1.5 shadow-lg"
                >
                  <button
                    type="button"
                    ref={menuItemRef}
                    role="menuitem"
                    onClick={openConfirm}
                    className="flex min-h-[48px] w-full items-center rounded-lg px-3 text-left text-[14px] font-bold text-red-600 transition active:scale-[0.98]"
                  >
                    Delete draft
                  </button>
                </div>
              )}
            </div>
          )}
          <Link
            href={`/owner/listings/new?draft=${draft.draftId}`}
            aria-label={`Continue ${title}`}
            className="flex min-h-[52px] flex-1 items-center justify-center rounded-2xl bg-brand-600 px-5 text-[16px] font-bold text-white transition active:scale-[0.98] sm:w-auto sm:min-w-[140px] sm:flex-none"
          >
            Continue
          </Link>
        </div>
      </div>
      {confirming && (
        <div className="mt-3 rounded-xl border border-line bg-paper p-3">
          <p className="text-[14px] font-bold">Delete this draft?</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            This will permanently remove your unfinished listing. You
            won&apos;t be able to recover it.
          </p>
          {error && (
            <p
              className="mt-1.5 text-[13px] leading-relaxed text-red-600"
              role="alert"
            >
              {error}
            </p>
          )}
          <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => void runDelete()}
              disabled={deleting}
              className="flex min-h-[48px] flex-1 items-center justify-center rounded-xl bg-red-600 px-4 text-[14.5px] font-bold text-white transition active:scale-[0.98] disabled:opacity-50"
            >
              {deleting ? "Deleting…" : error ? "Try again" : "Delete draft"}
            </button>
            <button
              type="button"
              ref={cancelRef}
              onClick={closeConfirm}
              disabled={deleting}
              className="flex min-h-[48px] flex-1 items-center justify-center rounded-xl border border-line bg-white px-4 text-[14.5px] font-semibold transition active:scale-[0.98] disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
