"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  emptyDraft,
  type DraftStatus,
  type ListingDraft,
} from "@/components/listing/types";

const DRAFTS_KEY = "agh-owner-drafts-v1";

function loadDrafts(): ListingDraft[] {
  try {
    const raw = localStorage.getItem(DRAFTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ListingDraft[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface Filters {
  maxBudget: number | null;
  roomTypes: string[];
  maxDistance: number | null;
  furnishedOnly: boolean;
  foodOnly: boolean;
  attachedBathOnly: boolean;
  wifiOnly: boolean;
  acOnly: boolean;
  parkingOnly: boolean;
  verifiedOnly: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  maxBudget: null,
  roomTypes: [],
  maxDistance: null,
  furnishedOnly: false,
  foodOnly: false,
  attachedBathOnly: false,
  wifiOnly: false,
  acOnly: false,
  parkingOnly: false,
  verifiedOnly: false,
};

export interface Visit {
  id: string;
  propertyId: string;
  date: string;
  time: string;
  status: "upcoming" | "completed" | "cancelled";
}

interface AppState {
  userName: string;
  setUserName: (n: string) => void;
  anchor: string;
  setAnchor: (a: string) => void;
  savedIds: string[];
  toggleSaved: (id: string) => void;
  visits: Visit[];
  addVisit: (v: Omit<Visit, "id" | "status">) => void;
  cancelVisit: (id: string) => void;
  filters: Filters;
  setFilters: (f: Filters) => void;
  resetFilters: () => void;
  onboarding: { roomType: string; place: string; budget: number | null; moveIn: string };
  setOnboarding: (o: Partial<AppState["onboarding"]>) => void;
  owner: { name: string; email: string; phone: string } | null;
  setOwner: (o: { name: string; email: string; phone: string } | null) => void;
  drafts: ListingDraft[];
  createDraft: () => string;
  updateDraft: (id: string, patch: Partial<ListingDraft>) => void;
  deleteDraft: (id: string) => void;
  setDraftStatus: (id: string, status: DraftStatus) => void;
}

const Ctx = createContext<AppState | null>(null);

let visitSeq = 1;

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [userName, setUserName] = useState("Ashim");
  const [anchor, setAnchor] = useState("Assam Downtown University");
  const [savedIds, setSavedIds] = useState<string[]>(["sunrise-residency"]);
  const [visits, setVisits] = useState<Visit[]>([
    { id: "v-seed-1", propertyId: "green-view-pg", date: "Sat, 14 Sep", time: "4:30 PM", status: "upcoming" },
    { id: "v-seed-2", propertyId: "scholar-stay", date: "Sat, 31 Aug", time: "11:00 AM", status: "completed" },
  ]);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [onboarding, setOnboardingState] = useState<AppState["onboarding"]>({
    roomType: "",
    place: "",
    budget: null,
    moveIn: "",
  });
  const [owner, setOwner] = useState<AppState["owner"]>(null);
  const [drafts, setDrafts] = useState<ListingDraft[]>([]);
  const [draftsHydrated, setDraftsHydrated] = useState(false);

  useEffect(() => {
    setDrafts(loadDrafts());
    setDraftsHydrated(true);
  }, []);

  useEffect(() => {
    if (!draftsHydrated) return;
    try {
      localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
    } catch {
      // prototype storage is best-effort
    }
  }, [drafts, draftsHydrated]);

  const value = useMemo<AppState>(
    () => ({
      userName,
      setUserName,
      anchor,
      setAnchor,
      savedIds,
      toggleSaved: (id) =>
        setSavedIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])),
      visits,
      addVisit: (v) =>
        setVisits((list) => [{ ...v, id: `v-${visitSeq++}`, status: "upcoming" }, ...list]),
      cancelVisit: (id) =>
        setVisits((list) => list.map((x) => (x.id === id ? { ...x, status: "cancelled" } : x))),
      filters,
      setFilters,
      resetFilters: () => setFilters(DEFAULT_FILTERS),
      onboarding,
      setOnboarding: (o) => setOnboardingState((s) => ({ ...s, ...o })),
      owner,
      setOwner,
      drafts,
      createDraft: () => {
        const d = emptyDraft(newId("draft"));
        setDrafts((list) => [d, ...list]);
        return d.id;
      },
      updateDraft: (id, patch) =>
        setDrafts((list) =>
          list.map((d) =>
            d.id === id ? { ...d, ...patch, updatedAt: Date.now() } : d
          )
        ),
      deleteDraft: (id) =>
        setDrafts((list) => list.filter((d) => d.id !== id)),
      setDraftStatus: (id, status) =>
        setDrafts((list) =>
          list.map((d) =>
            d.id === id ? { ...d, status, updatedAt: Date.now() } : d
          )
        ),
    }),
    [userName, anchor, savedIds, visits, filters, onboarding, owner, drafts]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
