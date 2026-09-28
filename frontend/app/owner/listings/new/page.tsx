"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import {
  ApiError,
  getMe,
  getOwnerListing,
  type OwnerListingItem,
  type OwnerPropertyItem,
} from "@/lib/api";
import {
  publishListingFlow,
  sweepPendingUploads,
  sweepTargetListingId,
} from "@/lib/publish-flow";
import { usePropertyChooser } from "./_components/use-property-chooser";
import { FormError } from "@/components/auth-ui";
import { WizardActions, WizardShell } from "@/components/ui/wizard";
import { ListingDraftStoreProvider, useListingDrafts } from "@/components/listing/draft-store";
import {
  createSubmitGuard,
  ensureListingIdForDraft,
  runSubmitAction,
  submitErrorMessage,
  type SubmitGuard,
} from "@/lib/listing-submit-action";
import type { SubmitResult } from "@/lib/listing-submit-flow";
import {
  CHAPTERS,
  IMPLEMENTED_CHAPTERS,
  clampChapter,
  emptyDraft,
  nextChapter,
  prefillPlaceFromProperty,
  prevChapter,
  suggestTitle,
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
  type ChapterId,
} from "@/lib/listing-draft";
import {
  ChoosePropertyChapter,
  IncludedChapter,
  KindChapter,
  MoveInChapter,
  NameChapter,
  PhotosChapter,
  PlaceNameChapter,
  PreviewChapter,
  PriceChapter,
  PublishChapter,
  SpaceChapter,
  WhatChapter,
  WhereChapter,
  WhoChapter,
} from "./_components/chapters";

function Wizard() {
  const router = useRouter();
  const params = useSearchParams();
  const { firebaseUser, loading: authLoading } = useAuth();
  const { ready, getDraft, createDraft, updateDraft, setCurrentChapter } = useListingDrafts();

  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState("");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [chapter, setChapter] = useState<ChapterId>("what");
  const [formError, setFormError] = useState<string | null>(null);

  // Backend send state (Publish chapter only). The guard lives in a ref so
  // a double-click / keyboard re-trigger during the in-flight request gets
  // `busy` instead of a second submission; `sending` drives the disabled
  // + loading UI.
  const submitGuardRef = useRef<SubmitGuard | null>(null);
  if (submitGuardRef.current === null) submitGuardRef.current = createSubmitGuard();
  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<Extract<
    SubmitResult,
    { ok: true }
  > | null>(null);

  // Real publish state (Step 14, after send). Backend is authoritative:
  // success reloads the listing; failure keeps DRAFT and shows the error.
  const publishGuardRef = useRef(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishedListing, setPublishedListing] =
    useState<OwnerListingItem | null>(null);

  // Original File bytes for local photo tiles, keyed by tile id. Shared
  // with the photos chapter so the Step-14 send can finish pending uploads.
  // Session-only by design: nothing binary ever touches localStorage.
  const [photoFiles] = useState(() => new Map<string, File>());

  // Owner gate: same behavior as the owner dashboard (unauthenticated ->
  // /owner/login; non-OWNER -> renter home). No second auth mechanism.
  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) {
      router.replace("/owner/login");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const me = await getMe();
        if (cancelled) return;
        if (me.role !== "OWNER") {
          router.replace("/");
          return;
        }
        setAuthChecked(true);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.isUnauthorized) {
          router.replace("/owner/login");
          return;
        }
        setAuthError(err instanceof ApiError ? err.message : "Couldn't load your account.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, firebaseUser, router]);

  // Draft bootstrap: ?draft= loads this user's draft; otherwise create one
  // and replace the URL (no reload). Unknown ids fall back to a new draft —
  // we never load another user's draft because storage is UID-scoped.
  // The ref guard makes creation run exactly once: without it, the effect
  // re-fires when getDraft identity changes after createDraft but before
  // router.replace updates the URL, orphaning a second "Untitled" draft.
  const bootstrappedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!authChecked || !ready) return;
    const requested = params.get("draft");
    if (requested && getDraft(requested)) {
      bootstrappedRef.current = requested;
      setDraftId(requested);
      return;
    }
    if (bootstrappedRef.current && getDraft(bootstrappedRef.current)) {
      setDraftId(bootstrappedRef.current);
      router.replace(`/owner/listings/new?draft=${bootstrappedRef.current}`);
      return;
    }
    const id = createDraft();
    bootstrappedRef.current = id;
    setDraftId(id);
    router.replace(`/owner/listings/new?draft=${id}`);
  }, [authChecked, ready, params, getDraft, createDraft, router]);

  const draft = draftId ? getDraft(draftId) : null;

  // Existing properties for the Choose Property chapter, loaded lazily on
  // first visit. UID-scoping (never show another user's properties) lives
  // inside the hook; see use-property-chooser.ts.
  const { properties, unitsCount, propertiesError, loadProperties } =
    usePropertyChooser(firebaseUser?.uid);

  useEffect(() => {
    if (chapter === "chooseproperty" && authChecked) void loadProperties();
  }, [chapter, authChecked, loadProperties]);

  useEffect(() => {
    if (draft) setChapter(draft.currentChapter);
  }, [draft?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const goChapter = useCallback(
    (next: ChapterId) => {
      if (!draft) return;
      // Never jump past the furthest reached chapter.
      const clamped = clampChapter(next, draft.furthestChapter);
      setCurrentChapter(draft.id, clamped);
      setChapter(clamped);
      setFormError(null);
      window.scrollTo({ top: 0 });
    },
    [draft, setCurrentChapter]
  );

  // Property selection: existing reuses the property id and prefills a
  // COMPLETE place replacement (never a merge); switching to "new" resets
  // the place to fresh defaults. Dependent unit/listing ids and progress
  // are reset alongside so a later send can never mix properties.
  const selectExistingProperty = useCallback(
    (item: OwnerPropertyItem) => {
      if (!draft) return;
      updateDraft(draft.id, {
        propertySource: "existing",
        backendIds: { ...draft.backendIds, propertyId: item.id, unitId: null, listingId: null },
        submitProgress: { price: false, availability: false },
        place: prefillPlaceFromProperty(item),
      });
      setFormError(null);
    },
    [draft, updateDraft]
  );

  const selectNewProperty = useCallback(() => {
    if (!draft) return;
    updateDraft(draft.id, {
      propertySource: "new",
      backendIds: { ...draft.backendIds, propertyId: null, unitId: null, listingId: null },
      submitProgress: { price: false, availability: false },
      place: emptyDraft(draft.id).place,
    });
    setFormError(null);
  }, [draft, updateDraft]);

  const onContinue = useCallback(() => {
    if (!draft) return;
    // Locked chapters show authoritative property data; nothing to validate.
    const lockedPlace = draft.propertySource === "existing";
    const message =
      chapter === "what"
        ? validateWhat(draft.space)
        : chapter === "kind"
          ? validateKind(draft.place)
          : chapter === "chooseproperty"
            ? validateChooseProperty(draft)
            : chapter === "where"
              ? lockedPlace
                ? null
                : validateWhere(draft.place)
            : chapter === "placename"
              ? lockedPlace
                ? null
                : validatePlaceName(draft.place)
              : chapter === "space"
                ? validateSpace(draft.space)
              : chapter === "photos"
                ? validatePhotos(draft.photos)
                : chapter === "price"
                  ? validatePrice(draft.pricing)
                  : chapter === "movein"
                    ? validateMoveIn(draft.availability)
                    : chapter === "name"
                      ? validateName(draft.listing)
                      : chapter === "who"
                        ? validateWho(draft.space, draft.place)
                        : null;
    if (message) {
      setFormError(message);
      return;
    }
    setFormError(null);
    // Advance to the next *implemented* chapter (name/preview/publish
    // land in later phases); when none remains, the draft is saved.
    const candidate = nextChapter(chapter);
    const next =
      candidate && (IMPLEMENTED_CHAPTERS as string[]).includes(candidate)
        ? candidate
        : null;
    if (!next) {
      router.push("/owner/dashboard");
      return;
    }
    setCurrentChapter(draft.id, next);
    setChapter(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [draft, chapter, setCurrentChapter, router]);

  // Upload local photo tiles that still have their File bytes (same
  // session). Runs after a send creates the backend listing, and backs the
  // photos chapter retry path. Best-effort per tile; failures stay visible
  // as failed tiles with retry.
  const uploadPendingPhotos = useCallback(
    async (draftId: string, listingId: number) => {
      await sweepPendingUploads({
        listingId,
        readPhotos: () => getDraft(draftId)?.photos ?? [],
        writePhotos: (photos) => updateDraft(draftId, { photos }),
        files: photoFiles,
      });
    },
    [getDraft, updateDraft, photoFiles]
  );

  // Send action: validate all chapters, submit exactly once, persist
  // ids + progress on BOTH success and failure so retry resumes. Never
  // touches real publish or amenities beyond the draft. On success, finishes
  // any pending photo uploads now that the listing id exists.
  const handleSend = useCallback(async () => {
    if (!draft) return;
    setSending(true);
    setSubmitError(null);
    try {
      const outcome = await runSubmitAction({
        draft,
        guard: submitGuardRef.current as SubmitGuard,
        persist: (ids, progress) =>
          updateDraft(draft.id, { backendIds: ids, submitProgress: progress }),
      });
      if (outcome.type === "busy") return;
      if (outcome.type === "invalid") {
        setSubmitError(outcome.blocker.message);
        goChapter(outcome.blocker.step);
        return;
      }
      if (!outcome.result.ok) {
        setSubmitError(submitErrorMessage(outcome.result));
        return;
      }
      setSendResult(outcome.result);
      const listingId = sweepTargetListingId(outcome.result);
      if (listingId != null) await uploadPendingPhotos(draft.id, listingId);
    } finally {
      setSending(false);
    }
  }, [draft, goChapter, updateDraft, getDraft, uploadPendingPhotos]);

  // Creates the backend DRAFT listing through draft-save validation when
  // the photos chapter needs an id. No navigation; failures return the
  // real blocker/transport message so the chapter never claims a network
  // problem for a validation state.
  const ensureListingId = useCallback(async (): Promise<
    { ok: true; listingId: number } | { ok: false; message: string }
  > => {
    if (!draft) return { ok: false, message: "Draft is still loading." };
    return ensureListingIdForDraft({
      draft,
      guard: submitGuardRef.current as SubmitGuard,
      persist: (ids) => updateDraft(draft.id, { backendIds: ids }),
    });
  }, [draft, updateDraft]);

  // Real publish: DRAFT -> PUBLISHED through the existing endpoint. Guards
  // live server-side; failure keeps DRAFT and surfaces the backend message.
  const handlePublish = useCallback(async () => {
    if (!draft || publishGuardRef.current) return;
    const listingId = normalizeBackendId(draft.backendIds?.listingId);
    if (listingId == null) {
      setPublishError("Send to Apun-Ghar first — then publish.");
      return;
    }
    publishGuardRef.current = true;
    setPublishing(true);
    setPublishError(null);
    try {
      const outcome = await publishListingFlow(listingId);
      if (!outcome.ok) {
        setPublishError(outcome.error);
        return;
      }
      // Authoritative state wins; the local preview simulation stays out
      // of it so "live preview" copy never describes a real publish.
      setPublishedListing(outcome.listing);
    } finally {
      setPublishing(false);
      publishGuardRef.current = false;
    }
  }, [draft]);

  // Authoritative lifecycle on the publish chapter: a backend PUBLISHED
  // listing shows PUBLISHED state even after reload — the session-only
  // published flag is never trusted on its own.
  const statusListingId = draft
    ? normalizeBackendId(draft.backendIds?.listingId)
    : null;
  useEffect(() => {
    if (chapter !== "publish" || statusListingId == null) return;
    if (publishedListing || publishing) return;
    let cancelled = false;
    void getOwnerListing(statusListingId)
      .then((row) => {
        if (!cancelled && row.status === "PUBLISHED") setPublishedListing(row);
      })
      .catch(() => {
        // Unreachable/deleted listings simply keep the draft flow.
      });
    return () => {
      cancelled = true;
    };
  }, [chapter, statusListingId, publishedListing, publishing]);

  const content = useMemo(() => {
    if (!draft) return null;
    const patchSpace = (patch: Partial<typeof draft.space>) =>
      updateDraft(draft.id, { space: { ...draft.space, ...patch } });
    const patchPlace = (patch: Partial<typeof draft.place>) =>
      updateDraft(draft.id, { place: { ...draft.place, ...patch } });
    // Locked-chapter display name: the live property row when loaded,
    // otherwise the prefilled draft name (set atomically at selection).
    const selectedPropertyName =
      draft.propertySource === "existing"
        ? properties?.find((p) => p.id === draft.backendIds.propertyId)?.name?.trim() ||
          draft.place.placeName.trim() ||
          null
        : null;
    if (chapter === "what")
      return (
        <WhatChapter
          space={draft.space}
          onSpace={patchSpace}
          onResetBasis={() =>
            updateDraft(draft.id, {
              pricing: { ...draft.pricing, rentBasis: "" },
            })
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
            updateDraft(draft.id, {
              space: { ...draft.space, pgFood: "", pgCurfew: null },
            })
          }
          error={formError}
        />
      );
    if (chapter === "chooseproperty")
      return (
        <ChoosePropertyChapter
          properties={properties}
          unitsCount={unitsCount}
          propertiesError={propertiesError}
          onRetryProperties={() => void loadProperties()}
          propertySource={draft.propertySource}
          selectedPropertyId={draft.backendIds.propertyId}
          onSelectNew={selectNewProperty}
          onSelectExisting={selectExistingProperty}
          error={formError}
        />
      );
    if (chapter === "where")
      return (
        <WhereChapter
          place={draft.place}
          onPlace={patchPlace}
          error={formError}
          lockedSourceName={
            draft.propertySource === "existing" ? selectedPropertyName : undefined
          }
        />
      );
    if (chapter === "placename")
      return (
        <PlaceNameChapter
          place={draft.place}
          onPlace={patchPlace}
          error={formError}
          lockedSourceName={
            draft.propertySource === "existing" ? selectedPropertyName : undefined
          }
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
          onPhotos={(photos) => updateDraft(draft.id, { photos })}
          error={formError}
          listingId={normalizeBackendId(draft.backendIds?.listingId)}
          onEnsureListing={ensureListingId}
          fileStore={photoFiles}
        />
      );
    if (chapter === "price")
      return (
        <PriceChapter
          pricing={draft.pricing}
          spaceKind={draft.space.kind}
          onPricing={(pricing) => updateDraft(draft.id, { pricing })}
          error={formError}
        />
      );
    if (chapter === "movein")
      return (
        <MoveInChapter
          availability={draft.availability}
          onAvailability={(availability) => updateDraft(draft.id, { availability })}
          error={formError}
        />
      );
    if (chapter === "name")
      return (
        <NameChapter
          listing={draft.listing}
          suggestion={suggestTitle(draft)}
          onListing={(listing) => updateDraft(draft.id, { listing })}
          error={formError}
        />
      );
    if (chapter === "preview") return <PreviewChapter draft={draft} go={goChapter} />;
    if (chapter === "publish")
      return (
        <PublishChapter
          draft={draft}
          go={goChapter}
          onPublishState={(localPublish) => updateDraft(draft.id, { localPublish })}
          onSend={handleSend}
          sending={sending}
          sendError={submitError}
          sendResult={sendResult}
          listingId={normalizeBackendId(draft.backendIds?.listingId)}
          onPublish={handlePublish}
          publishing={publishing}
          publishError={publishError}
          published={publishedListing?.status === "PUBLISHED"}
        />
      );
    // Unreachable: jump targets are clamped to furthestChapter, which only
    // advances through validated Continue steps above.
    return null;
  }, [draft, chapter, formError, updateDraft, goChapter, handleSend, sending, submitError, sendResult, properties, unitsCount, propertiesError, loadProperties, selectExistingProperty, selectNewProperty, ensureListingId, handlePublish, publishing, publishError, publishedListing, photoFiles]);

  if (authError) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 py-10">
        <FormError message={authError} />
      </main>
    );
  }
  if (!authChecked || !draft) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col items-center justify-center px-5">
        <p className="text-[14.5px] font-semibold text-muted">Loading your draft…</p>
      </main>
    );
  }

  return (
    <WizardShell
      backHref="/owner/dashboard"
      title={draft.space.kind ? "New listing" : "List your place"}
      subtitle="Saved automatically as you go"
      chapters={CHAPTERS}
      current={chapter}
      onJump={goChapter}
    >
      {content}
      {chapter !== "publish" && (
        <WizardActions
          onBack={(() => {
            const prev = prevChapter(chapter);
            return prev ? () => goChapter(prev) : undefined;
          })()}
          onContinue={onContinue}
          continueLabel={
            chapter === "preview" ? "Continue to publish" : "Save & continue"
          }
        />
      )}
    </WizardShell>
  );
}

function GatedWizard() {
  // Store is keyed by the live Firebase UID (never the URL): drafts created
  // here belong to the signed-in owner, and an empty UID yields an empty,
  // non-persisting store until auth resolves.
  const { firebaseUser } = useAuth();
  return (
    <ListingDraftStoreProvider uid={firebaseUser?.uid ?? ""}>
      <Wizard />
    </ListingDraftStoreProvider>
  );
}

export default function NewListingPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col items-center justify-center px-5">
          <p className="text-[14.5px] font-semibold text-muted">Loading your draft…</p>
        </main>
      }
    >
      <GatedWizard />
    </Suspense>
  );
}
