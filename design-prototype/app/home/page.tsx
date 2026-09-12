"use client";

import Link from "next/link";
import { useApp } from "@/store/AppStore";
import { PROPERTIES } from "@/data/properties";
import Icon from "@/components/Icon";
import BottomNav from "@/components/BottomNav";
import DesktopHeader from "@/components/DesktopHeader";
import PropertyCard from "@/components/PropertyCard";
import { FilterChip, SectionTitle } from "@/components/ui";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function Home() {
  const { userName, anchor, setFilters, filters } = useApp();
  const recommended = PROPERTIES.slice(0, 6);

  const quick = (label: string, apply: () => void) => (
    <FilterChip key={label} label={label} onClick={apply} />
  );

  return (
    <main className="flex min-h-dvh flex-col">
      <DesktopHeader />
      <div className="mx-auto w-full max-w-7xl px-5 pb-3 pt-6 lg:px-8">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] text-muted">{greeting()},</p>
            <h1 className="text-[21px] font-bold tracking-tight lg:text-[26px]">{userName}</h1>
          </div>
          <Link
            href="/profile"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-700 text-[16px] font-bold text-white lg:hidden"
          >
            {userName.charAt(0).toUpperCase()}
          </Link>
        </div>

        <Link
          href="/search"
          className="mt-4 flex min-h-[54px] items-center gap-3 rounded-2xl border border-line bg-white px-4 shadow-sm lg:max-w-2xl"
        >
          <Icon name="search" size={20} className="text-muted" />
          <span className="text-[14.5px] text-muted">Search by college, area or locality</span>
        </Link>

        <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5 lg:mx-0 lg:px-0">
          {quick("Near my college", () => setFilters({ ...filters, maxDistance: 2 }))}
          {quick("Under ₹10k", () => setFilters({ ...filters, maxBudget: 10000 }))}
          {quick("Private room", () => setFilters({ ...filters, roomTypes: ["Private room"] }))}
          {quick("PG", () => setFilters({ ...filters, roomTypes: ["PG"] }))}
          {quick("Verified only", () => setFilters({ ...filters, verifiedOnly: true }))}
        </div>
      </div>

      <div className="mx-auto w-full max-w-7xl flex-1 px-5 pb-6 lg:px-8">
        <SectionTitle
          title="Recommended for you"
          action={
            <Link href="/search" className="inline-flex items-center gap-0.5 text-[13.5px] font-semibold text-brand-700">
              See all <Icon name="chevR" size={16} />
            </Link>
          }
        />
        <p className="mb-3 flex items-center gap-1.5 text-[13px] text-muted">
          <Icon name="pin" size={15} className="text-brand-700" />
          Distances measured from {anchor}
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recommended.map((p) => (
            <PropertyCard key={p.id} p={p} />
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-3 rounded-2xl bg-clay-500 p-5 text-white sm:flex-row sm:items-center sm:justify-between lg:p-7">
          <div>
            <p className="text-[15.5px] font-bold lg:text-[18px]">Moving with a friend?</p>
            <p className="mt-1 max-w-md text-[13.5px] leading-relaxed text-white/85">
              Split a 2BHK near campus and save up to ₹3,000 each per month.
            </p>
          </div>
          <Link
            href="/search"
            className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl bg-white px-5 text-[14px] font-bold text-clay-600"
          >
            Explore flats
          </Link>
        </div>
      </div>

      <BottomNav />
    </main>
  );
}
