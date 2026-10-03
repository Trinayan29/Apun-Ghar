"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FormError } from "@/components/auth-ui";
import { FormSection, WizardActions, WizardShell } from "@/components/ui/wizard";
import {
  loadEditSession,
  loadEditSource,
  saveEditSession,
  EditLoadError,
  hydrateEditDraft,
  type EditSession,
} from "@/lib/listing-edit";
import {
  CHAPTERS,
  nextChapter,
  prevChapter,
  suggestTitle,
  type ChapterId,
  type ListingDraft,
} from "@/lib/listing-draft";
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

/**
 * Edit Listing, Phase 1: load + inspect only.
 *
 * Renders the existing wizard chapters over a hydrated backend listing.
 * NOTHING here mutates the backend: there is no send, no publish, no
 * photo upload wiring beyond the chapter's own listing-id path (which
 * only runs on explicit user action, same as create mode). The property
 * step is locked — reassignment is not supported.
 */
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

  const draft: ListingDraft | null = session?.draft ?? null;

  // Authoritative load: a stored session renders instantly, then the
  // backend re-hydration overwrites it (server wins; no merge in Phase 1).
  useEffect(() => {
    let cancelled = false;
    if (session === null) setLoading(true);
    void loadEditSource(listingId)
      .then((source) => {
        if (cancelled) return;
        const fresh = hydrateEditDraft(source);
        const next: EditSession = {
          draft: fresh,
          savedSnapshot: fresh,
          updatedAt: Date.now(),
        };
        saveEditSession(uid, listingId, next);
        setSession(next);
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
    // Re-run only when the target listing (or owner) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, listingId]);

  const patchDraft = useCallback(
    (patch: Partial<ListingDraft>) => {
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
  if (loadError || !draft) {
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
      subtitle="Inspecting your saved listing"
      chapters={CHAPTERS}
      current={chapter}
      onJump={goChapter}
    >
      {content}
      <WizardActions
        onBack={(() => {
          const prev = prevChapter(chapter);
          return prev ? () => goChapter(prev) : undefined;
        })()}
        onContinue={goNext}
        continueLabel="Continue"
      />
    </WizardShell>
  );
}
