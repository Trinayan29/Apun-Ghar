"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import type { AvailabilityState, FlowChapter, ListingDraft } from "@/components/listing/types";
import { Chapter } from "../_components/flow-ui";

export function validateMoveIn(a: AvailabilityState): string {
  if (!a.mode) return "Tell renters when they can move in.";
  if (a.mode === "from") {
    if (!a.date) return "Pick the first move-in date.";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (new Date(a.date + "T00:00:00") < today) return "That date has passed — pick today or later.";
  }
  return "";
}

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function MoveInChapter({
  draft,
  save,
  go,
  back,
}: {
  draft: ListingDraft;
  save: (patch: Partial<ListingDraft>) => void;
  go: (c: FlowChapter) => void;
  back: () => void;
}) {
  const [error, setError] = useState("");
  const a = draft.availability;
  const set = (patch: Partial<AvailabilityState>) => {
    save({ availability: { ...a, ...patch } });
    setError("");
  };

  const cards = [
    { mode: "now" as const, title: "Ready now", body: "A renter could move in this week.", icon: "check" as const },
    { mode: "from" as const, title: "Available from…", body: "Name the first move-in date.", icon: "calendar" as const },
    { mode: "full" as const, title: "Currently full", body: "Someone's staying right now.", icon: "user" as const },
  ];

  return (
    <Chapter
      id="movein"
      kicker="Timing"
      title="When can someone move in?"
      lede="Be honest here — it sets the right expectation from the very first message."
      error={error}
      onContinue={() => {
        const e = validateMoveIn(a);
        if (e) return setError(e);
        go("name");
      }}
      showBack
      onBack={back}
    >
      <div className="space-y-2.5" role="radiogroup" aria-label="Move-in timing">
        {cards.map((c) => {
          const active = a.mode === c.mode;
          return (
            <div key={c.mode}>
              <button
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => set({ mode: c.mode })}
                className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition active:scale-[0.99] ${
                  active ? "border-[#1677E8] bg-[#F1F7FF] shadow-[0_0_0_1px_#1677E8]" : "border-[#E3E8EF] bg-white"
                }`}
              >
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${active ? "bg-[#1677E8] text-white" : "bg-[#EAF3FF] text-[#1677E8]"}`}>
                  <Icon name={c.icon} size={20} />
                </span>
                <span className="flex-1">
                  <span className="block text-[16px] font-bold">{c.title}</span>
                  <span className="block text-[13.5px] text-[#5B6B7C]">{c.body}</span>
                </span>
              </button>
              {c.mode === "from" && active && (
                <div className="mt-2 pl-1">
                  <label htmlFor="mv-date" className="mb-1 block text-[13.5px] font-bold">
                    First move-in date
                  </label>
                  <input
                    id="mv-date"
                    type="date"
                    min={todayISO()}
                    value={a.date}
                    onChange={(e) => set({ date: e.target.value })}
                    className="min-h-[52px] w-full rounded-[14px] border border-[#E3E8EF] bg-white px-4 text-[15.5px] focus:border-[#1677E8] focus:outline-none sm:max-w-[240px]"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {a.mode === "full" && (
        <p className="mt-3 rounded-xl bg-[#EAF3FF] px-3.5 py-2.5 text-[13px] font-medium text-[#5B6B7C]">
          Your listing stays private while the space is full. You can still finish everything else —
          switch to a move-in date when you&apos;re ready to go live.
        </p>
      )}
    </Chapter>
  );
}
