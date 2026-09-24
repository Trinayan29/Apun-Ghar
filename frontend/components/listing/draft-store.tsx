"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  chapterIndex,
  emptyDraft,
  loadDrafts,
  newDraftId,
  nextSubmitProgress,
  saveDrafts,
  type ChapterId,
  type ListingDraft,
} from "@/lib/listing-draft";

interface DraftStoreValue {
  drafts: Record<string, ListingDraft>;
  /** Create a draft for this user and return its id. */
  createDraft: () => string;
  getDraft: (id: string) => ListingDraft | null;
  /** Shallow-merge patch; bumps updatedAt. Never touches other users. */
  updateDraft: (id: string, patch: Partial<ListingDraft>) => void;
  deleteDraft: (id: string) => void;
  setCurrentChapter: (id: string, chapter: ChapterId) => void;
  ready: boolean;
}

const DraftStoreContext = createContext<DraftStoreValue | null>(null);

/**
 * Per-user listing drafts. `uid` MUST be the currently authenticated
 * Firebase UID (from AuthProvider) — never from the URL or storage.
 * Storage key is `owner-listing-drafts:<uid>`, so signing out can never
 * leak one user's drafts to another.
 */
export function ListingDraftStoreProvider({
  uid,
  children,
}: {
  uid: string;
  children: ReactNode;
}) {
  const [drafts, setDrafts] = useState<Record<string, ListingDraft>>({});
  const [ready, setReady] = useState(false);

  // Hydrate once per user. Never touches localStorage during SSR.
  useEffect(() => {
    setReady(false);
    setDrafts(uid ? loadDrafts(uid) : {});
    setReady(true);
  }, [uid]);

  // Persist on change (skipped until hydration completes).
  useEffect(() => {
    if (!ready || !uid) return;
    saveDrafts(uid, drafts);
  }, [drafts, ready, uid]);

  const createDraft = useCallback(() => {
    const id = newDraftId();
    setDrafts((prev) => ({ ...prev, [id]: emptyDraft(id) }));
    return id;
  }, []);

  const getDraft = useCallback(
    (id: string) => drafts[id] ?? null,
    [drafts]
  );

  const updateDraft = useCallback((id: string, patch: Partial<ListingDraft>) => {
    setDrafts((prev) => {
      const existing = prev[id];
      if (!existing) return prev;
      // Centralized staleness guard: pricing/availability edits invalidate
      // only their own submit-progress flag, so a later send resubmits the
      // changed step instead of skipping it. Id/backend/progress patches
      // (e.g. the send handler persisting results) never trigger this.
      const submitProgress = nextSubmitProgress(existing, patch);
      return {
        ...prev,
        [id]: { ...existing, ...patch, submitProgress, updatedAt: Date.now() },
      };
    });
  }, []);

  const deleteDraft = useCallback((id: string) => {
    setDrafts((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const setCurrentChapter = useCallback((id: string, chapter: ChapterId) => {
    setDrafts((prev) => {
      const existing = prev[id];
      if (!existing) return prev;
      const reached = chapterIndex(chapter);
      const furthest = chapterIndex(existing.furthestChapter);
      return {
        ...prev,
        [id]: {
          ...existing,
          currentChapter: chapter,
          furthestChapter: reached > furthest ? chapter : existing.furthestChapter,
          updatedAt: Date.now(),
        },
      };
    });
  }, []);

  const value = useMemo<DraftStoreValue>(
    () => ({
      drafts,
      createDraft,
      getDraft,
      updateDraft,
      deleteDraft,
      setCurrentChapter,
      ready,
    }),
    [drafts, createDraft, getDraft, updateDraft, deleteDraft, setCurrentChapter, ready]
  );

  return <DraftStoreContext.Provider value={value}>{children}</DraftStoreContext.Provider>;
}

export function useListingDrafts(): DraftStoreValue {
  const ctx = useContext(DraftStoreContext);
  if (!ctx) throw new Error("useListingDrafts must be used inside ListingDraftStoreProvider");
  return ctx;
}
