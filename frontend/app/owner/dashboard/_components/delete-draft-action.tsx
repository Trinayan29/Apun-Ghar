import { useEffect, useRef, useState } from "react";
import {
  deleteDraftErrorMessage,
  type DeleteDraftOutcome,
} from "@/lib/draft-delete";

/**
 * Shared delete-draft interaction (Phase 2.2). Owns the destructive
 * affordance end to end: trigger, menu, confirmation with the exact
 * product copy, in-flight and error states, retry, and synchronous
 * double-submit protection. The caller supplies data gating (which
 * lifecycles may delete) and the deletion itself; this component never
 * calls the API or the store directly.
 *
 * Both presentations share one interaction flow — trigger opens a menu,
 * the menu item opens the confirmation — and differ only in how the
 * menu is positioned:
 * - "popover": absolutely-positioned menu. Used where the surrounding
 *   card has room for an overlay (DraftCard).
 * - "inline": menu rendered in normal document flow on its own full
 *   line. Used inside UnitRow, whose property card clips overlays
 *   (overflow-hidden).
 */

const TRIGGER_CLASSES =
  "flex h-[52px] w-[52px] items-center justify-center rounded-2xl border border-line bg-white text-ink transition active:scale-[0.98]";

const MENU_ITEM_CLASSES =
  "flex min-h-[48px] w-full items-center rounded-lg px-3 text-left text-[14px] font-bold text-red-600 transition active:scale-[0.98]";

export function DeleteDraftAction({
  label,
  presentation,
  onDelete,
}: {
  /** Accessible name fragment, e.g. the listing title. */
  label: string;
  /** "popover" floats the menu; "inline" renders it in normal flow. */
  presentation: "popover" | "inline";
  /** Runs the deletion; resolves with the orchestrator outcome. */
  onDelete: () => Promise<DeleteDraftOutcome>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Synchronous single-flight guard (mirrors ListingLifecycleAction):
  // React state hasn't flushed on a same-tick second click, so the ref —
  // set before the callback runs, cleared in `finally` — is what actually
  // prevents a duplicate deletion. `deleting` remains purely for UI.
  const deleteRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuItemRef = useRef<HTMLButtonElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  // Separate region for the inline menu: it renders as a sibling of the
  // trigger wrapper (not inside it), so the outside-click boundary must
  // cover both regions. The popover menu needs no second ref because it
  // renders inside the trigger wrapper.
  const inlineMenuRef = useRef<HTMLDivElement | null>(null);

  // Outside-click and Escape close the open menu; Escape returns focus
  // to the trigger. Applies to both presentations.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (inlineMenuRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  // Escape closes the confirmation (unless a deletion is in flight) and
  // returns focus to the trigger.
  useEffect(() => {
    if (!confirming || deleting) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setConfirming(false);
        setError(null);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [confirming, deleting]);

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
    triggerRef.current?.focus();
  };

  const runDelete = async () => {
    if (deleteRef.current) return;
    deleteRef.current = true;
    setDeleting(true);
    setError(null);
    try {
      const outcome = await onDelete();
      if (outcome.type === "busy") return;
      if (outcome.type === "not-deletable") {
        setError(deleteDraftErrorMessage(outcome));
        return;
      }
      if (!outcome.result.ok) {
        setError(deleteDraftErrorMessage(outcome.result));
        return;
      }
      // Success: the parent refreshes and this control unmounts. Reset
      // defensively in case it somehow remains visible.
      setConfirming(false);
    } finally {
      deleteRef.current = false;
      setDeleting(false);
    }
  };

  // Layout contract (M1 fix): the trigger lives inside the parent's
  // horizontal action row, but the confirmation panel must NOT be a
  // squeezed flex item of that row. The panel renders as a sibling with
  // basis-full, and both host rows use flex-wrap, so it always takes its
  // own full-width line below the actions in normal document flow.
  return (
    <>
      <div
        className={
          presentation === "popover" ? "relative shrink-0" : "shrink-0"
        }
        ref={menuRef}
      >
        <button
          type="button"
          ref={triggerRef}
          onClick={() => setMenuOpen((open) => !open)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`More actions for ${label}`}
          className={TRIGGER_CLASSES}
        >
          <span aria-hidden className="text-[20px] font-bold leading-none">
            ⋯
          </span>
        </button>
        {presentation === "popover" && menuOpen && (
          <div
            role="menu"
            aria-label={`Actions for ${label}`}
            className="absolute right-0 top-full z-30 mt-2 min-w-[180px] rounded-xl border border-line bg-white p-1.5 shadow-lg"
          >
            <button
              type="button"
              ref={menuItemRef}
              role="menuitem"
              onClick={openConfirm}
              className={MENU_ITEM_CLASSES}
            >
              Delete draft
            </button>
          </div>
        )}
      </div>
      {presentation === "inline" && menuOpen && (
        <div
          ref={inlineMenuRef}
          role="menu"
          aria-label={`Actions for ${label}`}
          className="mt-2 basis-full rounded-xl border border-line bg-white p-1.5"
        >
          <button
            type="button"
            ref={menuItemRef}
            role="menuitem"
            onClick={openConfirm}
            className={MENU_ITEM_CLASSES}
          >
            Delete draft
          </button>
        </div>
      )}
      {confirming && (
        <div className="mt-3 basis-full rounded-xl border border-line bg-paper p-3">
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
    </>
  );
}
