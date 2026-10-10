"use client";

import { useState } from "react";
import type { FlowChapter, ListingDraft, PlaceState } from "@/components/listing/types";
import { Chapter, Field, inputCls } from "../_components/flow-ui";

const AREAS = [
  "Jalukbari",
  "Beltola",
  "Ganeshguri",
  "Six Mile",
  "Chandmari",
  "Paltan Bazaar",
  "Maligaon",
  "Khanapara",
  "Dispur",
  "Ulubari",
  "Hatigaon",
  "Zoo Road",
];

export function validateWhere(p: PlaceState): string {
  if (!p.area.trim()) return "Choose the area where your property is located.";
  if (p.address.trim().length < 5) return "Add the house number, street and a landmark.";
  if (!p.city.trim()) return "City is needed — Guwahati is filled in for you.";
  if (p.pincode.trim() && !/^[1-9][0-9]{5}$/.test(p.pincode.trim()))
    return "That pincode doesn't look right — 6 digits, e.g. 781028.";
  return "";
}

export default function WhereChapter({
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
  const [query, setQuery] = useState("");
  const p = draft.place;
  const set = (patch: Partial<PlaceState>) => save({ place: { ...p, ...patch } });
  const q = (query || p.area).trim().toLowerCase();
  const matches = AREAS.filter((a) => a.toLowerCase().includes(q)).slice(0, 8);

  return (
    <Chapter
      id="where"
      kicker="Finding you"
      title="Where's your place?"
      lede="Start with the area — most renters search by neighbourhood, not street name."
      error={error}
      onContinue={() => {
        const e = validateWhere(p);
        if (e) return setError(e);
        setError("");
        go("space");
      }}
      showBack
      onBack={back}
    >
      <Field id="w-area" label="Area" hint="Type a few letters, then pick.">
        <input
          id="w-area"
          value={query || p.area}
          placeholder="e.g. Beltola"
          autoComplete="off"
          onChange={(e) => {
            setQuery(e.target.value);
            set({ area: e.target.value });
          }}
          onFocus={() => setQuery(p.area)}
          className={inputCls(!!error && !p.area.trim())}
        />
      </Field>
      {matches.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5" role="listbox" aria-label="Area suggestions">
          {matches.map((a) => (
            <button
              key={a}
              type="button"
              role="option"
              aria-selected={p.area === a}
              onClick={() => {
                set({ area: a });
                setQuery("");
                setError("");
              }}
              className={`rounded-full border px-3.5 py-2 text-[13.5px] font-semibold transition active:scale-95 ${
                p.area === a
                  ? "border-[#1677E8] bg-[#1677E8] text-white"
                  : "border-[#E3E8EF] bg-white"
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      )}

      <div className="mt-5">
        <Field
          id="w-address"
          label="What's the address?"
          hint="House or building number, street, and a landmark renters will recognise."
        >
          <textarea
            id="w-address"
            rows={2}
            placeholder="House 12, survey road, near Beltola market"
            value={p.address}
            onChange={(e) => set({ address: e.target.value })}
            className="min-h-[76px] w-full rounded-[14px] border border-[#E3E8EF] bg-white px-4 py-3 text-[15.5px] placeholder:text-[#93A1B3] focus:border-[#1677E8] focus:outline-none"
          />
        </Field>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field id="w-city" label="City">
          <input id="w-city" value={p.city} onChange={(e) => set({ city: e.target.value })} className={inputCls()} />
        </Field>
        <Field id="w-pin" label="Pincode (optional)">
          <input
            id="w-pin"
            inputMode="numeric"
            placeholder="781028"
            value={p.pincode}
            onChange={(e) => set({ pincode: e.target.value.replace(/[^0-9]/g, "").slice(0, 6) })}
            className={inputCls()}
          />
        </Field>
      </div>

      <div className="mt-4 rounded-2xl border border-[#E3E8EF] bg-white p-4">
        <p className="text-[14px] font-bold">Is there a college, office or landmark nearby? <span className="font-normal text-[#5B6B7C]">(optional)</span></p>
        <p className="mt-0.5 text-[13px] text-[#5B6B7C]">Places near a known spot get found faster.</p>
        <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
          <input
            aria-label="Nearby college"
            placeholder="College, e.g. Cotton University"
            value={p.nearCollege}
            onChange={(e) => set({ nearCollege: e.target.value })}
            className={inputCls()}
          />
          <input
            aria-label="Nearby workplace"
            placeholder="Workplace, e.g. GNRC Hospital"
            value={p.nearWorkplace}
            onChange={(e) => set({ nearWorkplace: e.target.value })}
            className={inputCls()}
          />
        </div>
      </div>

      <details className="rounded-2xl border border-[#E3E8EF] bg-white p-4">
        <summary className="cursor-pointer text-[14px] font-bold text-[#1677E8]">
          Gate timings and building age (optional)
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="w-gate" className="mb-1 block text-[13px] font-semibold">Gate closes at</label>
            <input id="w-gate" type="time" value={p.gateTime} onChange={(e) => set({ gateTime: e.target.value })} className={inputCls()} />
          </div>
          <div>
            <label htmlFor="w-floors" className="mb-1 block text-[13px] font-semibold">Total floors</label>
            <input id="w-floors" inputMode="numeric" placeholder="3" value={p.floors}
              onChange={(e) => set({ floors: e.target.value.replace(/[^0-9]/g, "").slice(0, 2) })} className={inputCls()} />
          </div>
          <div>
            <label htmlFor="w-built" className="mb-1 block text-[13px] font-semibold">Built year</label>
            <input id="w-built" inputMode="numeric" placeholder="2015" value={p.builtYear}
              onChange={(e) => set({ builtYear: e.target.value.replace(/[^0-9]/g, "").slice(0, 4) })} className={inputCls()} />
          </div>
        </div>
      </details>
    </Chapter>
  );
}
