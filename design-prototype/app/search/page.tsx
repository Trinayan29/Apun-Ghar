"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useApp } from "@/store/AppStore";
import { PROPERTIES } from "@/data/properties";
import Icon from "@/components/Icon";
import BottomNav from "@/components/BottomNav";
import DesktopHeader from "@/components/DesktopHeader";
import PropertyCard from "@/components/PropertyCard";
import { FilterChip } from "@/components/ui";

export function applyFilters(list: typeof PROPERTIES, f: ReturnType<typeof useApp>["filters"], query: string) {
  const q = query.trim().toLowerCase();
  return list.filter((p) => {
    if (q && !(p.name + p.locality + p.anchor).toLowerCase().includes(q)) return false;
    if (f.maxBudget !== null && p.rent + p.maintenance + p.utilities > f.maxBudget) return false;
    if (f.roomTypes.length > 0 && !f.roomTypes.includes(p.roomType) && !f.roomTypes.includes(p.category)) {
      if (!(f.roomTypes.includes("Flat / apartment") && p.category === "Flat")) return false;
    }
    if (f.maxDistance !== null && p.distanceKm > f.maxDistance) return false;
    if (f.furnishedOnly && p.furnished === "Unfurnished") return false;
    if (f.foodOnly && !p.food) return false;
    if (f.attachedBathOnly && !p.attachedBath) return false;
    if (f.wifiOnly && !p.wifi) return false;
    if (f.acOnly && !p.ac) return false;
    if (f.parkingOnly && !p.parking) return false;
    if (f.verifiedOnly && !p.verified) return false;
    return true;
  });
}

export default function Search() {
  const { filters, resetFilters } = useApp();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"Recommended" | "Price: low to high" | "Distance">("Recommended");

  const results = useMemo(() => {
    const r = applyFilters(PROPERTIES, filters, query);
    if (sort === "Price: low to high")
      return [...r].sort((a, b) => a.rent + a.maintenance + a.utilities - (b.rent + b.maintenance + b.utilities));
    if (sort === "Distance") return [...r].sort((a, b) => a.distanceKm - b.distanceKm);
    return r;
  }, [filters, query, sort]);

  const activeCount =
    (filters.maxBudget !== null ? 1 : 0) +
    filters.roomTypes.length +
    (filters.maxDistance !== null ? 1 : 0) +
    [filters.furnishedOnly, filters.foodOnly, filters.attachedBathOnly, filters.wifiOnly, filters.acOnly, filters.parkingOnly, filters.verifiedOnly].filter(Boolean).length;

  return (
    <main className="flex min-h-dvh flex-col">
      <DesktopHeader />
      <div className="border-b border-line bg-paper">
        <div className="mx-auto w-full max-w-7xl px-5 pb-3 pt-6 lg:px-8">
        <div className="flex min-h-[52px] items-center gap-2.5 rounded-2xl border border-line bg-white px-4">
          <Icon name="search" size={20} className="text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search college, area or locality"
            className="w-full bg-transparent text-[14.5px] text-ink placeholder:text-muted focus:outline-none"
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label="Clear search">
              <Icon name="close" size={18} className="text-muted" />
            </button>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <Link href="/filters" className="relative shrink-0">
            <span className="flex min-h-[40px] items-center gap-1.5 rounded-full bg-ink px-4 text-[13.5px] font-semibold text-white">
              <Icon name="sliders" size={17} /> Filters
              {activeCount > 0 && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-400 text-[11px] font-bold text-ink">
                  {activeCount}
                </span>
              )}
            </span>
          </Link>
          {(["Recommended", "Price: low to high", "Distance"] as const).map((s) => (
            <FilterChip key={s} label={s} active={sort === s} onClick={() => setSort(s)} />
          ))}
        </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-7xl flex-1 px-5 py-4 lg:px-8">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[13.5px] font-semibold text-ink">
            {results.length} place{results.length === 1 ? "" : "s"} near ADTU
          </p>
          {activeCount > 0 && (
            <button onClick={resetFilters} className="text-[13px] font-semibold text-brand-700">
              Clear all
            </button>
          )}
        </div>
        {results.length === 0 ? (
          <div className="mt-10 flex flex-col items-center px-8 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-cream">
              <Icon name="search" size={28} className="text-muted" />
            </span>
            <h2 className="mt-4 text-[17px] font-bold">No places match those filters</h2>
            <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
              Try raising your budget or removing a filter or two — new places get added every week.
            </p>
            <button
              onClick={resetFilters}
              className="mt-5 min-h-[48px] rounded-2xl bg-brand-600 px-6 text-[14.5px] font-bold text-white"
            >
              Reset filters
            </button>
          </div>
        ) : (
          <div className="grid gap-4 pb-4 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((p) => (
              <PropertyCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </main>
  );
}
