"use client";

import { useState } from "react";
import { isWholeHome, type FlowChapter, type ListingDraft } from "@/components/listing/types";
import { Chapter, Field, RadioRows, Stepper, inputCls } from "../_components/flow-ui";

const FLOORS = ["Ground", "1", "2", "3", "4+", "Don't know"];
const BATHS = ["1", "2", "3+"];

export default function SpaceChapter({
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
  const s = draft.space;
  const wholeHome = isWholeHome(s.kind);
  const set = (patch: Partial<typeof s>) => {
    save({ space: { ...s, ...patch } });
    setError("");
  };

  const title = wholeHome
    ? `Tell us about this ${s.kind}`
    : s.kind === "Shared room"
      ? "Tell us about the room"
      : s.kind === "Bed in PG / Hostel"
        ? "Tell us about the bed"
        : s.kind === "Something else"
          ? "Tell us about the space"
          : "Tell us about the room";

  const next = () => {
    if (!s.furnishing) return setError("How furnished is it? Renters filter by this.");
    go("included");
  };

  return (
    <Chapter
      id="space"
      kicker="The space"
      title={title}
      lede="Only what a renter would ask on a visit — nothing more."
      error={error}
      onContinue={next}
      showBack
      onBack={back}
    >
      {wholeHome && (
        <p className="mb-4 inline-block rounded-full bg-[#EAF3FF] px-3.5 py-1.5 text-[13.5px] font-bold text-[#0F5BB5]">
          {s.kind}
        </p>
      )}

      <p className="mb-1.5 text-[14px] font-bold">How furnished is it?</p>
      <RadioRows
        ariaLabel="Furnishing"
        value={s.furnishing}
        onPick={(v) => set({ furnishing: v as typeof s.furnishing })}
        options={[
          { value: "Unfurnished", title: "Unfurnished", body: "No furniture" },
          { value: "Semi-furnished", title: "Semi-furnished", body: "Some essentials are already there" },
          { value: "Fully furnished", title: "Fully furnished", body: "Ready to move in" },
        ]}
      />

      <div className="mt-5">
        <p className="mb-2 text-[14px] font-bold">A few more details</p>
        <div className="space-y-2.5">
          {wholeHome ? (
            <div className="rounded-2xl border border-[#E3E8EF] bg-white px-4 py-3">
              <p className="text-[14.5px] font-semibold">How many bathrooms?</p>
              <div className="mt-2 flex gap-1.5" role="radiogroup" aria-label="Bathrooms">
                {BATHS.map((b) => {
                  const active = s.bathrooms === b;
                  return (
                    <button
                      key={b}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => set({ bathrooms: active ? "" : b })}
                      className={`flex h-[52px] flex-1 items-center justify-center rounded-[14px] border text-[16px] font-bold transition active:scale-95 ${
                        active ? "border-[#1677E8] bg-[#EAF3FF] text-[#0F5BB5]" : "border-[#E3E8EF] bg-white"
                      }`}
                    >
                      {b}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <Stepper
              label="Bathrooms"
              value={Number(s.bathrooms) || 0}
              max={6}
              onChange={(v) => set({ bathrooms: String(v) })}
            />
          )}
          <div className="rounded-2xl border border-[#E3E8EF] bg-white px-4 py-3">
            <p className="text-[14.5px] font-semibold">Which floor is it on?</p>
            <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Floor">
              {FLOORS.map((f) => {
                const active = s.floorNo === f;
                return (
                  <button
                    key={f}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => set({ floorNo: active ? "" : f })}
                    className={`min-h-[44px] rounded-xl border px-4 text-[14px] font-bold transition active:scale-95 ${
                      active ? "border-[#1677E8] bg-[#1677E8] text-white" : "border-[#E3E8EF] bg-white"
                    }`}
                  >
                    {f}
                  </button>
                );
              })}
            </div>
          </div>
          <Field id="sp-size" label={wholeHome ? "About how large is it?" : "Room size (optional)"}>
            <div className="relative">
              <input
                id="sp-size"
                inputMode="numeric"
                placeholder="350"
                value={s.carpetArea}
                onChange={(e) => set({ carpetArea: e.target.value.replace(/[^0-9]/g, "").slice(0, 5) })}
                className={`${inputCls()} pr-16`}
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[14px] font-semibold text-[#5B6B7C]">
                sq ft
              </span>
            </div>
          </Field>
        </div>
      </div>
    </Chapter>
  );
}
