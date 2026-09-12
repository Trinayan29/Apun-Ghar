"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApp, DEFAULT_FILTERS } from "@/store/AppStore";
import { PROPERTIES } from "@/data/properties";
import { applyFilters } from "@/app/search/page";
import Icon from "@/components/Icon";
import DesktopHeader from "@/components/DesktopHeader";
import { FilterChip, PrimaryButton } from "@/components/ui";

const ROOM_OPTS = ["Private room", "Shared room", "PG", "Hostel", "Flat / apartment"];
const BUDGET_OPTS = [6000, 8000, 10000, 15000];
const DIST_OPTS = [1, 2, 3, 5];

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="flex min-h-[54px] w-full items-center justify-between rounded-xl border border-line bg-white px-4 text-[14.5px] font-medium"
    >
      {label}
      <span className={`flex h-7 w-12 items-center rounded-full p-1 transition ${value ? "justify-end bg-brand-600" : "justify-start bg-line"}`}>
        <span className="h-5 w-5 rounded-full bg-white shadow" />
      </span>
    </button>
  );
}

export default function Filters() {
  const router = useRouter();
  const { filters, setFilters } = useApp();
  const [draft, setDraft] = useState(filters);
  const count = applyFilters(PROPERTIES, draft, "").length;
  const set = (p: Partial<typeof draft>) => setDraft({ ...draft, ...p });

  const toggleRoom = (r: string) =>
    set({ roomTypes: draft.roomTypes.includes(r) ? draft.roomTypes.filter((x) => x !== r) : [...draft.roomTypes, r] });

  return (
    <main className="flex min-h-dvh flex-col">
      <DesktopHeader />
      <div className="flex items-center justify-between border-b border-line bg-paper px-5 py-4">
        <button onClick={() => router.back()} aria-label="Close filters" className="flex h-10 w-10 items-center justify-center rounded-full bg-white border border-line">
          <Icon name="close" size={19} />
        </button>
        <h1 className="text-[17px] font-bold">Filters</h1>
        <button onClick={() => { setDraft(DEFAULT_FILTERS); }} className="text-[14px] font-semibold text-brand-700">
          Reset
        </button>
      </div>

      <div className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-5 py-5 lg:px-8">
        <section>
          <h2 className="mb-2.5 text-[14.5px] font-bold">Monthly budget (total cost)</h2>
          <div className="flex flex-wrap gap-2">
            {BUDGET_OPTS.map((b) => (
              <FilterChip key={b} label={`Under ₹${b / 1000}k`} active={draft.maxBudget === b} onClick={() => set({ maxBudget: draft.maxBudget === b ? null : b })} />
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-2.5 text-[14.5px] font-bold">Room type</h2>
          <div className="flex flex-wrap gap-2">
            {ROOM_OPTS.map((r) => (
              <FilterChip key={r} label={r} active={draft.roomTypes.includes(r)} onClick={() => toggleRoom(r)} />
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-2.5 text-[14.5px] font-bold">Max distance</h2>
          <div className="flex flex-wrap gap-2">
            {DIST_OPTS.map((d) => (
              <FilterChip key={d} label={`Within ${d} km`} active={draft.maxDistance === d} onClick={() => set({ maxDistance: draft.maxDistance === d ? null : d })} />
            ))}
          </div>
        </section>

        <section className="grid gap-2.5 sm:grid-cols-2">
          <h2 className="text-[14.5px] font-bold sm:col-span-2">Must-haves</h2>
          <Toggle label="Furnished" value={draft.furnishedOnly} onChange={(v) => set({ furnishedOnly: v })} />
          <Toggle label="Food included" value={draft.foodOnly} onChange={(v) => set({ foodOnly: v })} />
          <Toggle label="Attached bathroom" value={draft.attachedBathOnly} onChange={(v) => set({ attachedBathOnly: v })} />
          <Toggle label="Wi-Fi" value={draft.wifiOnly} onChange={(v) => set({ wifiOnly: v })} />
          <Toggle label="AC" value={draft.acOnly} onChange={(v) => set({ acOnly: v })} />
          <Toggle label="Parking" value={draft.parkingOnly} onChange={(v) => set({ parkingOnly: v })} />
          <Toggle label="Verified only" value={draft.verifiedOnly} onChange={(v) => set({ verifiedOnly: v })} />
        </section>
      </div>

      <div className="sticky bottom-0 border-t border-line bg-white px-5 py-4">
        <PrimaryButton onClick={() => { setFilters(draft); router.push("/search"); }}>
          Show {count} place{count === 1 ? "" : "s"}
        </PrimaryButton>
      </div>
    </main>
  );
}
