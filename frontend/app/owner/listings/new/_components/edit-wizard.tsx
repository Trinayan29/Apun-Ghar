"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FormError } from "@/components/auth-ui";
import { FormSection, WizardActions, WizardShell } from "@/components/ui/wizard";
import {
  editSessionDirty,
  loadEditSession,
  loadEditSource,
  reconcileEditSession,
  saveEditSession,
  EditLoadError,
  hydrateEditDraft,
  type EditSession,
} from "@/lib/listing-edit";
import {
  countChanges,
  diffListingChanges,
  hasSignificantChanges,
} from "@/lib/listing-changes";
import {
  confirmEditSaveReload,
  runEditSave,
  type EditSaveFailure,
  type EditSaveStep,
} from "@/lib/listing-edit-save";
import {
  CHAPTERS,
  nextChapter,
  normalizeBackendId,
  prevChapter,
  suggestTitle,
  type ChapterId,
  type ListingDraft,
} from "@/lib/listing-draft";
import { createSubmitGuard, type SubmitGuard } from "@/lib/listing-submit-action";
import {
  IncludedChapter,
  KindChapter,
  MoveInChapter,
  NameChapter,
  PhotosChapter,
  PlaceNameChapter,
  PreviewChapter,
  PriceChapter,
  SpaceChapter,
  WhatChapter,
  WhereChapter,
  WhoChapter,
} from "./chapters";
import { ReviewChanges, SaveFailurePanel, SaveProgressPanel, SaveSuccessPanel } from "./review-changes";

/**
 * Edit Listing: load + inspect + save.
 *
 * Reads stay GET-only (loader, refresh, retry). The only mutations are
 * the explicit P2.3c save flow from Review Changes: sequential
 * Property/Unit/Listing/Pricing/Availability writes through
 * runEditSave, then exactly one authoritative reload that becomes the
 * new snapshot. The property step stays locked — reassignment is not
 * supported.
 */
export type SaveUiState =
  | { phase: "idle" }
  | {
      phase: "saving";
      planned: EditSaveStep[];
      done: EditSaveStep[];
      current: EditSaveStep | null;
    }
  | { phase: "failed"; failure: EditSaveFailure }
  | { phase: "saved"; stale: boolean };

export function EditWizard({
  uid,
  listingId,
}: {
  uid: string;
  listingId: number;
}) {
  const [session, setSession] = useState<EditSession | null>(() =>
    loadEditSession(uid, listingId)
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(session === null);
  const [chapter, setChapter] = useState<ChapterId>("what");
  const [formError, setFormError] = useState<string | null>(null);
  const [fileStore] = useState(() => new Map<string, File>());
  const [serverNewer, setServerNewer] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  // P2.2 review overlay: local view state only. Opening/closing never
  // touches the backend or storage; the P2.1 session stays authoritative.
  const [reviewOpen, setReviewOpen] = useState(false);
  // P2.3c save machine: idle -> saving -> failed/saved. The session
  // itself is only replaced on adopted success; every other outcome
  // leaves draft/snapshot exactly as they were.
  const [saveUi, setSaveUi] = useState<SaveUiState>({ phase: "idle" });

  const draft: ListingDraft | null = session?.draft ?? null;
  const isDirty = session !== null && editSessionDirty(session);
  // savedSnapshot-vs-draft diff for the review screen. Recomputed from
  // the live session, so discard/retry while reviewing updates it (a
  // session that went clean shows the review empty state, never stale).
  const changeGroups = useMemo(
    () =>
      session ? diffListingChanges(session.savedSnapshot, session.draft) : [],
    [session]
  );
  const changeCount = countChanges(changeGroups);

  // Latest session for the async load below (avoids a stale closure while
  // keeping the effect dependency list stable).
  const sessionRef = useRef(session);
  sessionRef.current = session;
  // Armed only by an explicit Discard tap: the next load adopts the
  // server state even though the stored session is dirty.
  const discardArmedRef = useRef(false);
  // Single-flight save guard (one orchestrator at a time per wizard).
  const saveGuardRef = useRef<SubmitGuard | null>(null);
  // True while a save flight is running: discard/retry stay parked so a
  // background reload can never adopt over the in-flight save. The
  // generation check remains authoritative regardless.
  const saveActiveRef = useRef(false);

  // Authoritative load: a stored session renders instantly, then the
  // backend re-hydration reconciles. Clean sessions adopt the server
  // state; dirty sessions keep local edits and raise the server-newer
  // banner instead of silently overwriting. Nothing here ever writes to
  // the backend — reconciliation is localStorage + state only.
  useEffect(() => {
    let cancelled = false;
    if (sessionRef.current === null) setLoading(true);
    void loadEditSource(listingId)
      .then((source) => {
        if (cancelled) return;
        const fresh = hydrateEditDraft(source);
        const reconciled = discardArmedRef.current
          ? {
              session: {
                draft: fresh,
                savedSnapshot: fresh,
                updatedAt: Date.now(),
              },
              serverNewer: false,
            }
          : reconcileEditSession(sessionRef.current, fresh);
        discardArmedRef.current = false;
        saveEditSession(uid, listingId, reconciled.session);
        setSession(reconciled.session);
        setServerNewer(reconciled.serverNewer);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(
          err instanceof EditLoadError
            ? err.message
            : "Couldn't load this listing."
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Re-run when the target listing, owner, or an explicit discard asks
    // for a fresh authoritative load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, listingId, reloadNonce]);

  // Explicit discard: drop local edits and reload authoritative state.
  // This is the only path that throws local edits away, and only on tap.
  // Parked while a save flight runs (the generation guard would win
  // anyway, but a mid-save discard would only confuse the outcome).
  const discardEdits = useCallback(() => {
    if (saveActiveRef.current) return;
    discardArmedRef.current = true;
    setServerNewer(false);
    setReloadNonce((n) => n + 1);
  }, []);

  const patchDraft = useCallback(
    (patch: Partial<ListingDraft>) => {
      // A fresh local edit cancels a pending armed discard: the owner has
      // chosen to keep working, so a later reload must not wipe the draft.
      // (Idempotent assignment; safe under StrictMode double-invocation.)
      discardArmedRef.current = false;
      // Any new edit retires a settled save outcome: the next save is a
      // fresh full attempt, never a stale resume.
      setSaveUi({ phase: "idle" });
      setSession((prev) => {
        if (!prev) return prev;
        const next: EditSession = {
          ...prev,
          draft: { ...prev.draft, ...patch, updatedAt: Date.now() },
          updatedAt: Date.now(),
        };
        saveEditSession(uid, listingId, next);
        return next;
      });
    },
    [uid, listingId]
  );

  // Retry an authoritative reload without changing local edits. Used by
  // the inline reload-error banner; unlike discard it never arms adoption.
  // Parked while a save flight runs, like discard.
  const retryLoad = useCallback(() => {
    if (saveActiveRef.current) return;
    setLoadError(null);
    setReloadNonce((n) => n + 1);
  }, []);

  // P2.2 review entry: opens only for dirty sessions (a clean session
  // must never reach an empty review screen). Pure view-state flip —
  // no backend, no storage writes.
  const openReview = useCallback(() => {
    if (session !== null && editSessionDirty(session)) {
      setSaveUi({ phase: "idle" });
      setReviewOpen(true);
      window.scrollTo({ top: 0 });
    }
  }, [session]);

  // Back to editing: returns to the current chapter with the session
  // intact. Never discards, reloads, or calls the backend.
  const closeReview = useCallback(() => {
    setSaveUi({ phase: "idle" });
    setReviewOpen(false);
    window.scrollTo({ top: 0 });
  }, []);

  // P2.3c save execution. Captures the live session (identity + updatedAt
  // generation), runs the orchestrator, and adopts the authoritative
  // result only when the generation still matches. Every other outcome
  // leaves the session exactly as it was.
  const executeSave = useCallback(
    async (opts: {
      confirmed: boolean;
      fromStep?: EditSaveStep;
      fromDetail?: "price-clear" | "price-full";
    }) => {
      const sess = sessionRef.current;
      if (!sess || !editSessionDirty(sess)) return;
      if (saveGuardRef.current === null)
        saveGuardRef.current = createSubmitGuard();
      const propertyId = normalizeBackendId(sess.draft.backendIds?.propertyId);
      const unitId = normalizeBackendId(sess.draft.backendIds?.unitId);
      const listingId = normalizeBackendId(sess.draft.backendIds?.listingId);
      if (propertyId === null || unitId === null || listingId === null) {
        setSaveUi({
          phase: "failed",
          failure: {
            ok: false,
            reason: "context-failed",
            appliedSteps: [],
            pendingSteps: [],
            error:
              "Couldn't read the saved listing — reload and try again.",
          },
        });
        return;
      }
      const captured = sess;
      saveActiveRef.current = true;
      setSaveUi({ phase: "saving", planned: [], done: [], current: null });
      window.scrollTo({ top: 0 });
      try {
        const outcome = await runEditSave({
          draft: sess.draft,
          snapshot: sess.savedSnapshot,
          ids: { propertyId, unitId, listingId },
          generation: sess.updatedAt,
          significant: hasSignificantChanges(
            diffListingChanges(sess.savedSnapshot, sess.draft)
          ),
          confirmed: opts.confirmed,
          fromStep: opts.fromStep,
          fromDetail: opts.fromDetail,
          guard: saveGuardRef.current,
          isCurrent: () => sessionRef.current === captured,
          onProgress: (event) => {
            if (event.type === "plan") {
              setSaveUi((prev) =>
                prev.phase === "saving"
                  ? { ...prev, planned: event.steps }
                  : prev
              );
            } else if (event.type === "step-start") {
              setSaveUi((prev) =>
                prev.phase === "saving"
                  ? { ...prev, current: event.step }
                  : prev
              );
            } else {
              setSaveUi((prev) =>
                prev.phase === "saving" && !prev.done.includes(event.step)
                  ? {
                      ...prev,
                      done: [...prev.done, event.step],
                      current: null,
                    }
                  : prev
              );
            }
          },
        });
        if (outcome.ok) {
          if (outcome.noChanges) {
            setSaveUi({ phase: "idle" });
          } else if (outcome.adopted) {
            const adopted: EditSession = {
              draft: outcome.freshDraft,
              savedSnapshot: outcome.freshDraft,
              updatedAt: Date.now(),
            };
            saveEditSession(uid, listingId, adopted);
            setSession(adopted);
            setServerNewer(false);
            setSaveUi({ phase: "saved", stale: false });
          } else {
            // Server save completed but the owner kept editing: their
            // newer draft survives untouched; review shows the remainder.
            setSaveUi({ phase: "saved", stale: true });
          }
        } else {
          setSaveUi({ phase: "failed", failure: outcome });
        }
      } finally {
        saveActiveRef.current = false;
        window.scrollTo({ top: 0 });
      }
    },
    [uid]
  );

  // Retry from the failed logical step with a fresh plan (never stale
  // bodies). Confirmation stands from the review visit.
  const retrySave = useCallback(() => {
    if (saveUi.phase !== "failed") return;
    const failure = saveUi.failure;
    if (
      failure.reason !== "step-failed" &&
      failure.reason !== "context-failed"
    )
      return;
    void executeSave({
      confirmed: true,
      fromStep: failure.failedStep,
      fromDetail: failure.failedDetail,
    });
  }, [saveUi, executeSave]);

  // Reload-only retry: confirms the already-applied save without
  // repeating any mutation.
  const retrySaveReload = useCallback(() => {
    const sess = sessionRef.current;
    const listingId = normalizeBackendId(sess?.draft.backendIds?.listingId);
    if (!sess || listingId === null) return;
    const captured = sess;
    saveActiveRef.current = true;
    setSaveUi({ phase: "saving", planned: [], done: [], current: null });
    void confirmEditSaveReload({
      listingId,
      generation: sess.updatedAt,
      isCurrent: () => sessionRef.current === captured,
    })
      .then((outcome) => {
        if (!outcome.ok) {
          setSaveUi({
            phase: "failed",
            failure: {
              ok: false,
              reason: "reload-failed",
              appliedSteps: [],
              pendingSteps: [],
              needsReloadOnly: true,
              error: outcome.error,
            },
          });
          return;
        }
        if (outcome.adopted) {
          const adopted: EditSession = {
            draft: outcome.freshDraft,
            savedSnapshot: outcome.freshDraft,
            updatedAt: Date.now(),
          };
          saveEditSession(uid, listingId, adopted);
          setSession(adopted);
          setServerNewer(false);
          setSaveUi({ phase: "saved", stale: false });
        } else {
          setSaveUi({ phase: "saved", stale: true });
        }
      })
      .finally(() => {
        saveActiveRef.current = false;
        window.scrollTo({ top: 0 });
      });
  }, [uid]);

  const goChapter = useCallback(
    (next: ChapterId) => {
      setChapter(next);
      setFormError(null);
      window.scrollTo({ top: 0 });
    },
    []
  );

  // Declared with the other hooks (never after a conditional return):
  // inspection-only forward navigation, no validation, no furthest gate.
  const goNext = useCallback(() => {
    const next = nextChapter(chapter);
    if (next) goChapter(next);
  }, [chapter, goChapter]);

  const content = useMemo(() => {
    if (!draft) return null;
    const patchSpace = (patch: Partial<typeof draft.space>) =>
      patchDraft({ space: { ...draft.space, ...patch } });
    const patchPlace = (patch: Partial<typeof draft.place>) =>
      patchDraft({ place: { ...draft.place, ...patch } });
    if (chapter === "what")
      return (
        <WhatChapter
          space={draft.space}
          onSpace={patchSpace}
          onResetBasis={() =>
            patchDraft({ pricing: { ...draft.pricing, rentBasis: "" } })
          }
          error={formError}
        />
      );
    if (chapter === "kind")
      return (
        <KindChapter
          place={draft.place}
          onPlace={patchPlace}
          onLeavePgBuilding={() =>
            patchDraft({ space: { ...draft.space, pgFood: "", pgCurfew: null } })
          }
          error={formError}
        />
      );
    if (chapter === "chooseproperty")
      return (
        <FormSection
          id="chapter-property-locked"
          kicker="Your property"
          title="Property is fixed for this listing"
          lede="This listing belongs to the property below. Moving a listing to another property isn't supported."
        >
          <p className="rounded-2xl bg-cream px-4 py-3 text-[14.5px] font-bold">
            {draft.place.placeName.trim() || "Untitled property"}
          </p>
        </FormSection>
      );
    if (chapter === "where")
      return (
        <WhereChapter
          place={draft.place}
          onPlace={patchPlace}
          error={formError}
          lockedSourceName={draft.place.placeName.trim() || undefined}
        />
      );
    if (chapter === "placename")
      return (
        <PlaceNameChapter
          place={draft.place}
          onPlace={patchPlace}
          error={formError}
          lockedSourceName={draft.place.placeName.trim() || undefined}
        />
      );
    if (chapter === "space")
      return <SpaceChapter draft={draft} onSpace={patchSpace} error={formError} />;
    if (chapter === "included")
      return <IncludedChapter draft={draft} onSpace={patchSpace} error={formError} />;
    if (chapter === "who")
      return (
        <WhoChapter
          draft={draft}
          onSpace={patchSpace}
          onPlace={patchPlace}
          error={formError}
        />
      );
    if (chapter === "photos")
      return (
        <PhotosChapter
          photos={draft.photos}
          onPhotos={(photos) => patchDraft({ photos })}
          error={formError}
          listingId={listingId}
          onEnsureListing={async () => ({ ok: true as const, listingId })}
          fileStore={fileStore}
          readOnly
        />
      );
    if (chapter === "price")
      return (
        <PriceChapter
          pricing={draft.pricing}
          spaceKind={draft.space.kind}
          onPricing={(pricing) => patchDraft({ pricing })}
          error={formError}
        />
      );
    if (chapter === "movein")
      return (
        <MoveInChapter
          availability={draft.availability}
          onAvailability={(availability) => patchDraft({ availability })}
          error={formError}
        />
      );
    if (chapter === "name")
      return (
        <NameChapter
          listing={draft.listing}
          suggestion={suggestTitle(draft)}
          onListing={(listing) => patchDraft({ listing })}
          error={formError}
        />
      );
    if (chapter === "preview") return <PreviewChapter draft={draft} go={goChapter} />;
    if (chapter === "publish")
      return (
        <FormSection
          id="chapter-publish-edit"
          kicker="Publish"
          title="Saving arrives in Phase 2"
          lede="You're inspecting this listing. Nothing you change here is sent anywhere yet."
        >
          <Link
            href="/owner/dashboard"
            className="mt-3 flex min-h-[52px] items-center justify-center rounded-2xl bg-brand-600 text-[16px] font-bold text-white transition active:scale-[0.98]"
          >
            Back to Studio
          </Link>
        </FormSection>
      );
    return null;
  }, [draft, chapter, formError, patchDraft, goChapter, listingId, fileStore]);

  if (loading && !draft) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 py-10">
        <p className="text-[14.5px] font-semibold text-muted">Loading your listing.</p>
      </main>
    );
  }
  // Full-page error only when there is no usable draft at all. When a
  // draft exists (e.g. a Discard refetch failed), the wizard keeps
  // rendering and the error surfaces inline with a Retry action.
  if (!draft) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 py-10">
        <FormError message={loadError ?? "Couldn't load this listing."} />
        <Link
          href="/owner/dashboard"
          className="mt-4 flex min-h-[52px] items-center justify-center rounded-2xl border border-line bg-white text-[15.5px] font-bold transition active:scale-[0.98]"
        >
          Back to Studio
        </Link>
      </main>
    );
  }
  return (
    <WizardShell
      backHref="/owner/dashboard"
      title="Edit listing"
      subtitle={isDirty ? "Unsaved changes" : "Inspecting your saved listing"}
      chapters={CHAPTERS}
      current={chapter}
      onJump={goChapter}
    >
      {loadError && (
        <div
          role="alert"
          className="mb-4 rounded-2xl border border-line bg-red-50 px-4 py-3"
        >
          <p className="text-[14px] font-bold text-red-700">
            Couldn&apos;t refresh from the server.
          </p>
          <p className="mt-1 text-[13.5px] text-muted">{loadError}</p>
          <div className="mt-3">
            <button
              type="button"
              onClick={() => retryLoad()}
              className="flex min-h-[44px] w-full items-center justify-center rounded-xl bg-brand-600 px-4 text-[14px] font-bold text-white transition active:scale-[0.98]"
            >
              Retry reload
            </button>
          </div>
        </div>
      )}
      {serverNewer && (
        <div
          role="alert"
          className="mb-4 rounded-2xl border border-line bg-cream px-4 py-3"
        >
          <p className="text-[14px] font-bold">Server has newer data.</p>
          <p className="mt-1 text-[13.5px] text-muted">
            Your edits are kept. Reloading will discard them.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setServerNewer(false)}
              className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-line bg-white text-[14px] font-bold transition active:scale-[0.98]"
            >
              Keep my edits
            </button>
            <button
              type="button"
              onClick={() => void discardEdits()}
              className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-brand-600 px-4 text-[14px] font-bold text-white transition active:scale-[0.98]"
            >
              Discard &amp; reload
            </button>
          </div>
        </div>
      )}
      {reviewOpen ? (
        saveUi.phase === "saving" ? (
          <SaveProgressPanel done={saveUi.done} current={saveUi.current} />
        ) : saveUi.phase === "failed" ? (
          <SaveFailurePanel
            failure={saveUi.failure}
            onRetry={retrySave}
            onRetryReload={retrySaveReload}
            onBack={closeReview}
          />
        ) : saveUi.phase === "saved" ? (
          <SaveSuccessPanel stale={saveUi.stale} onBackEditing={closeReview} />
        ) : (
          <ReviewChanges
            groups={changeGroups}
            onBack={closeReview}
            save={
              isDirty
                ? {
                    significant: hasSignificantChanges(changeGroups),
                    onSave: (confirmed: boolean) =>
                      void executeSave({ confirmed }),
                  }
                : undefined
            }
          />
        )
      ) : (
        <>
          {content}
          {isDirty && (
            <div className="mt-6 rounded-2xl border border-line bg-white px-4 py-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[14.5px] font-bold">Unsaved changes</p>
                  <p className="mt-0.5 text-[13px] text-muted">
                    {changeCount === 1
                      ? "1 change since the saved version."
                      : `${changeCount} changes since the saved version.`}{" "}
                    Nothing is sent anywhere yet.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openReview}
                  className="flex min-h-[48px] items-center justify-center rounded-xl bg-ink px-6 text-[14.5px] font-bold text-white transition active:scale-[0.98]"
                >
                  Review Changes
                </button>
              </div>
            </div>
          )}
          <WizardActions
            onBack={(() => {
              const prev = prevChapter(chapter);
              return prev ? () => goChapter(prev) : undefined;
            })()}
            onContinue={goNext}
            continueLabel="Continue"
          />
        </>
      )}
    </WizardShell>
  );
}
