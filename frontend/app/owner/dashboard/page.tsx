"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useAuth } from "@/components/AuthProvider";
import { ApiError, getMe, type AppUser } from "@/lib/api";
import { FormError } from "@/components/auth-ui";
import {
  OwnerBottomNav,
  OwnerDesktopHeader,
  OwnerEmptyState,
  BuildingIcon,
} from "@/components/owner-ui";
import {
  ListingDraftStoreProvider,
  useListingDrafts,
} from "@/components/listing/draft-store";
import {
  createSubmitGuard,
  runSubmitAction,
  submitErrorMessage,
  type SubmitGuard,
} from "@/lib/listing-submit-action";
import {
  createDeleteDraftGuard,
  findLocalDraftIdByListingId,
  runDeleteDraft,
  type DeleteDraftGuard,
  type DeleteDraftOutcome,
} from "@/lib/draft-delete";
import {
  loadStudioData,
  type StudioData,
  type StudioDraft,
} from "@/lib/studio-data";
import { StudioShell } from "./_components/studio-shell";
import { IdentityStrip } from "./_components/identity-strip";
import { AddPlaceButton } from "./_components/add-place-button";
import { InboxStub } from "./_components/section-slots";
import { NeedsAttention } from "./_components/needs-attention";
import { ContinueDrafts } from "./_components/continue-drafts";
import { YourPlaces } from "./_components/your-places";

export default function OwnerDashboardPage() {
  // Store is keyed by the live Firebase UID (never the URL), matching the
  // listing wizard: retry reads the same UID-scoped drafts the wizard wrote.
  const { firebaseUser } = useAuth();
  return (
    <ListingDraftStoreProvider uid={firebaseUser?.uid ?? ""}>
      <Dashboard />
    </ListingDraftStoreProvider>
  );
}

function Dashboard() {
  const router = useRouter();
  const { firebaseUser, loading: authLoading } = useAuth();
  const { getDraft, updateDraft, deleteDraft } = useListingDrafts();
  const [me, setMe] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [authChecked, setAuthChecked] = useState(false);

  const [studio, setStudio] = useState<StudioData | null>(null);
  const [studioStatus, setStudioStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [studioError, setStudioError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const u = await getMe();
      if (u.role !== "OWNER") {
        router.replace("/");
        return;
      }
      setMe(u);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Couldn't load your account."
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  // Owner guard: unauthenticated → /owner/login; USER/ADMIN → renter home
  // (never the owner studio); 401 → /owner/login.
  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) {
      router.replace("/owner/login");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const u = await getMe();
        if (cancelled) return;
        if (u.role !== "OWNER") {
          router.replace("/");
          return;
        }
        setMe(u);
        setLoading(false);
        setAuthChecked(true);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.isUnauthorized) {
          router.replace("/owner/login");
          return;
        }
        setLoading(false);
        setLoadError(
          err instanceof ApiError ? err.message : "Couldn't load your account."
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, firebaseUser, router]);

  const loadStudio = useCallback(async () => {
    const uid = firebaseUser?.uid;
    if (!uid) return;
    setStudioStatus("loading");
    setStudioError(null);
    try {
      const result = await loadStudioData({ uid });
      setStudio(result.data);
      if (result.status === "auth-error") {
        router.replace("/owner/login");
        return;
      }
      if (result.status === "inventory-error") {
        setStudioStatus("error");
        setStudioError(result.inventoryError);
        return;
      }
      setStudioStatus("ready");
    } catch {
      // loadStudioData only rejects on unexpected failures; drafts may
      // still be absent. Keep the shell structurally safe, not blank.
      setStudioStatus("error");
      setStudioError("Couldn't load your places right now.");
    }
  }, [firebaseUser?.uid, router]);

  useEffect(() => {
    if (!authChecked) return;
    void loadStudio();
  }, [authChecked, loadStudio]);

  // Needs Attention retry: single-flight guard per wizard mount, per-item
  // sending/error state. Persists ids + progress on both success and
  // failure via the existing machinery, then reloads authoritative Studio
  // data so the item disappears only when it truly no longer qualifies.
  // flushSync forces the store's localStorage write before the reload
  // reads it back; without it the refresh could see stale progress.
  const submitGuardRef = useRef<SubmitGuard | null>(null);
  if (submitGuardRef.current === null)
    submitGuardRef.current = createSubmitGuard();
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [actionErrors, setActionErrors] = useState<Record<string, string | null>>(
    {}
  );

  const handleRetry = useCallback(
    async (draftId: string) => {
      const full = getDraft(draftId);
      if (!full) {
        setActionErrors((m) => ({
          ...m,
          [draftId]: "Couldn't find that draft on this device.",
        }));
        return;
      }
      setSending((m) => ({ ...m, [draftId]: true }));
      setActionErrors((m) => ({ ...m, [draftId]: null }));
      try {
        const outcome = await runSubmitAction({
          draft: full,
          guard: submitGuardRef.current as SubmitGuard,
          persist: (ids, progress) =>
            flushSync(() => {
              updateDraft(draftId, { backendIds: ids, submitProgress: progress });
            }),
        });
        if (outcome.type === "busy") return;
        if (outcome.type === "invalid") {
          // A pending draft edited into an invalid state cannot be fixed
          // from here: open it in the wizard (same destination as
          // Continue), where the chapter validation guides the fix.
          router.push(`/owner/listings/new?draft=${draftId}`);
          return;
        }
        if (!outcome.result.ok) {
          const message = submitErrorMessage(outcome.result);
          setActionErrors((m) => ({ ...m, [draftId]: message }));
          return;
        }
        await loadStudio();
      } finally {
        setSending((m) => ({ ...m, [draftId]: false }));
      }
    },
    [getDraft, updateDraft, loadStudio, router]
  );

  // Delete Draft: single-flight guard shared across cards, per the Retry
  // pattern above. Local cleanup runs only after backend success (the
  // orchestrator enforces this); flushSync forces the store's
  // localStorage write before the reload reads it back, otherwise the
  // deleted draft would reappear from stale storage. On failure the
  // draft is kept and the card surfaces the error.
  const deleteGuardRef = useRef<DeleteDraftGuard | null>(null);
  if (deleteGuardRef.current === null)
    deleteGuardRef.current = createDeleteDraftGuard();

  const handleDeleteDraft = useCallback(
    async (draft: StudioDraft): Promise<DeleteDraftOutcome> => {
      const outcome = await runDeleteDraft({
        draft,
        guard: deleteGuardRef.current as DeleteDraftGuard,
        removeLocal: () => {
          flushSync(() => {
            deleteDraft(draft.draftId);
          });
        },
      });
      if (outcome.type === "done" && outcome.result.ok) {
        await loadStudio();
      }
      return outcome;
    },
    [deleteDraft, loadStudio]
  );

  // Delete from Your Places: acts on the backend listing, so the input
  // is a minimal target built from the unit row. On success the
  // companion local draft (if any) must go too — otherwise it would
  // linger pointing at a deleted listing, undeletable and unretryable.
  // No match invents nothing: backend deletion still succeeds alone.
  const handleDeleteUnitListing = useCallback(
    async (
      listingId: number,
      lifecycle: string
    ): Promise<DeleteDraftOutcome> => {
      const outcome = await runDeleteDraft({
        draft: { backendIds: { listingId }, linkedLifecycle: lifecycle },
        guard: deleteGuardRef.current as DeleteDraftGuard,
        removeLocal: () => {
          const match = findLocalDraftIdByListingId(
            studio?.drafts ?? [],
            listingId
          );
          if (match === null) return;
          flushSync(() => {
            deleteDraft(match);
          });
        },
      });
      if (outcome.type === "done" && outcome.result.ok) {
        await loadStudio();
      }
      return outcome;
    },
    [deleteDraft, loadStudio, studio]
  );

  const draftTitles = useMemo(() => {
    if (!studio) return {};
    return Object.fromEntries(
      studio.drafts.map((d) => [d.draftId, d.title])
    ) as Record<string, string | null>;
  }, [studio]);

  if (authLoading || loading) {
    return (
      <main className="mx-auto w-full max-w-sm px-6 py-10">
        <p className="text-[14px] text-muted" role="status">
          Loading…
        </p>
      </main>
    );
  }

  if (loadError || !me) {
    return (
      <main className="mx-auto w-full max-w-sm px-6 py-10">
        <FormError message={loadError || "Couldn't load your account."} />
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 h-12 w-full rounded-xl border border-line bg-white text-[15px] font-semibold"
        >
          Retry
        </button>
        <Link
          href="/owner/login"
          className="mt-2 block h-12 w-full rounded-xl bg-white py-3 text-center text-[15px] font-semibold text-brand-700 underline"
        >
          Go to owner sign-in
        </Link>
      </main>
    );
  }

  const summary = studio?.summary ?? null;
  const studioState =
    studioStatus === "loading" ? "loading" : studioStatus === "error" ? "error" : "ready";
  const isEmpty =
    studioState === "ready" &&
    studio !== null &&
    studio.properties.length === 0 &&
    studio.drafts.length === 0 &&
    studio.attention.length === 0;

  return (
    <main className="flex min-h-dvh flex-col bg-paper text-ink">
      <OwnerDesktopHeader name={me.display_name ?? me.email ?? "Owner"} />
      <IdentityStrip
        displayName={me.display_name}
        email={me.email}
        summary={summary}
        state={studioState}
      />

      <StudioShell
        main={
          <>
            <div className="lg:hidden">
              <AddPlaceButton />
            </div>
            {studioState === "loading" && (
              <p className="text-[14px] text-muted" role="status">
                Loading your studio…
              </p>
            )}
            {studioState === "error" && (
              <div>
                <FormError
                  message={studioError ?? "Couldn't load your places right now."}
                />
                <button
                  type="button"
                  onClick={() => void loadStudio()}
                  className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-xl border border-line bg-white px-5 text-[15px] font-semibold"
                >
                  Retry
                </button>
              </div>
            )}
            {studio !== null && (
              <NeedsAttention
                items={studio.attention}
                titles={draftTitles}
                sending={sending}
                errors={actionErrors}
                onRetry={(draftId) => void handleRetry(draftId)}
              />
            )}
            {studio !== null && (
              <ContinueDrafts
                drafts={studio.drafts}
                attention={studio.attention}
                onDelete={(draft) => handleDeleteDraft(draft)}
              />
            )}
            {studio !== null && (
              <YourPlaces
                properties={studio.properties}
                onListingChanged={() => void loadStudio()}
                onEditListing={(listingId) =>
                  router.push(
                    `/owner/listings/new?mode=edit&listingId=${listingId}`
                  )
                }
                onDeleteListing={(listingId, lifecycle) =>
                  handleDeleteUnitListing(listingId, lifecycle)
                }
              />
            )}
            {studio !== null && isEmpty && (
              <OwnerEmptyState
                title="No places yet"
                body="Add your first place to start reaching renters. It takes about ten minutes, one small step at a time."
                icon={<BuildingIcon />}
                action={<AddPlaceButton />}
              />
            )}
          </>
        }
        rail={
          <>
            <div className="hidden lg:block">
              <AddPlaceButton />
            </div>
            <InboxStub />
          </>
        }
      />

      <OwnerBottomNav />
    </main>
  );
}
