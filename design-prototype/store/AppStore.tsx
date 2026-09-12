"use client";

import React, { createContext, useContext, useMemo, useState } from "react";

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
    }),
    [userName, anchor, savedIds, visits, filters, onboarding]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
