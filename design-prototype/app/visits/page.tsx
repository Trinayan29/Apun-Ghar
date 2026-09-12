"use client";

import Link from "next/link";
import { useState } from "react";
import { useApp } from "@/store/AppStore";
import BottomNav from "@/components/BottomNav";
import DesktopHeader from "@/components/DesktopHeader";
import VisitCard from "@/components/VisitCard";
import Icon from "@/components/Icon";

const TABS = ["Upcoming", "Completed", "Cancelled"] as const;

export default function Visits() {
  const { visits } = useApp();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Upcoming");
  const key = tab.toLowerCase() as "upcoming" | "completed" | "cancelled";
  const list = visits.filter((v) => v.status === key);

  return (
    <main className="flex min-h-dvh flex-col">
      <DesktopHeader />
      <div className="mx-auto w-full max-w-7xl px-5 pb-2 pt-6 lg:px-8">
        <h1 className="text-[22px] font-bold tracking-tight">My visits</h1>
        <div className="mt-3 flex gap-2">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`min-h-[40px] flex-1 rounded-full text-[13.5px] font-semibold transition ${
                tab === t ? "bg-ink text-white" : "bg-cream text-muted"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="mx-auto w-full max-w-7xl flex-1 px-5 py-3 lg:px-8">
        {list.length === 0 ? (
          <div className="mt-12 flex flex-col items-center px-8 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-cream">
              <Icon name="calendar" size={28} className="text-muted" />
            </span>
            <h2 className="mt-4 text-[17px] font-bold">No {key} visits</h2>
            <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
              {key === "upcoming"
                ? "Schedule a visit from any property page and it will show up here."
                : `Nothing ${key} yet.`}
            </p>
            {key === "upcoming" && (
              <Link
                href="/search"
                className="mt-5 flex min-h-[48px] items-center rounded-2xl bg-brand-600 px-6 text-[14.5px] font-bold text-white"
              >
                Find a place
              </Link>
            )}
          </div>
        ) : (
          <div className="grid gap-3 pb-4 lg:grid-cols-2">
            {list.map((v) => (
              <VisitCard key={v.id} visit={v} />
            ))}
          </div>
        )}
      </div>
      <BottomNav />
    </main>
  );
}
