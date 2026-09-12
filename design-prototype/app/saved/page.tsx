"use client";

import Link from "next/link";
import { useApp } from "@/store/AppStore";
import { PROPERTIES } from "@/data/properties";
import BottomNav from "@/components/BottomNav";
import DesktopHeader from "@/components/DesktopHeader";
import PropertyCard from "@/components/PropertyCard";
import Icon from "@/components/Icon";
import { SectionTitle } from "@/components/ui";

export default function Saved() {
  const { savedIds } = useApp();
  const saved = PROPERTIES.filter((p) => savedIds.includes(p.id));

  return (
    <main className="flex min-h-dvh flex-col">
      <DesktopHeader />
      <div className="mx-auto w-full max-w-7xl px-5 pb-2 pt-6 lg:px-8">
        <h1 className="text-[22px] font-bold tracking-tight">Saved places</h1>
        <p className="mt-0.5 text-[13.5px] text-muted">
          {saved.length === 0 ? "Your shortlist lives here." : `${saved.length} saved · compare anytime`}
        </p>
      </div>
      <div className="mx-auto w-full max-w-7xl flex-1 px-5 py-3 lg:px-8">
        {saved.length === 0 ? (
          <div className="mt-12 flex flex-col items-center px-8 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-cream">
              <Icon name="heart" size={28} className="text-muted" />
            </span>
            <h2 className="mt-4 text-[17px] font-bold">No saved places yet</h2>
            <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
              Save places you like and compare them later.
            </p>
            <Link
              href="/search"
              className="mt-5 flex min-h-[48px] items-center rounded-2xl bg-brand-600 px-6 text-[14.5px] font-bold text-white"
            >
              Explore places
            </Link>
          </div>
        ) : (
          <>
            <SectionTitle title="Your shortlist" />
            <div className="grid gap-4 pb-4 sm:grid-cols-2 lg:grid-cols-3">
              {saved.map((p) => (
                <PropertyCard key={p.id} p={p} />
              ))}
            </div>
          </>
        )}
      </div>
      <BottomNav />
    </main>
  );
}
