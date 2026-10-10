"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import {
  POLICY_ROWS,
  type FlowChapter,
  type ListingDraft,
  type Policy,
  type SpaceState,
} from "@/components/listing/types";
import { BigChoices, Chapter } from "../_components/flow-ui";

const AMENITY_ICONS: Record<string, string> = {
  "Wi-Fi": "wifi",
  AC: "ac",
  Parking: "park",
  "Power backup": "clock",
  "Food / mess": "food",
  "Attached bathroom": "bath",
  CCTV: "shield",
  Security: "shield",
};

const GROUPS: { title: string; items: string[] }[] = [
  { title: "Room", items: ["Wi-Fi", "AC", "Attached bathroom", "Balcony", "Kitchen"] },
  {
    title: "Property",
    items: ["Parking", "CCTV", "Security", "Power backup", "Washing machine / laundry", "Housekeeping"],
  },
  { title: "Other", items: ["Food / mess", "Water"] },
];

export function IncludedChapter({
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
  const s = draft.space;
  const toggle = (v: string) =>
    save({
      space: {
        ...s,
        amenities: s.amenities.includes(v) ? s.amenities.filter((a) => a !== v) : [...s.amenities, v],
      },
    });

  return (
    <Chapter
      id="included"
      kicker="What's included"
      title="What's included with the place?"
      lede="Tick what renters get — skip anything that doesn't apply. You can change this anytime."
      onContinue={() => go("who")}
      showBack
      onBack={back}
    >
      <div className="space-y-4">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <p className="mb-2 text-[12px] font-bold uppercase tracking-[0.12em] text-[#5B6B7C]">{g.title}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {g.items.map((a) => {
                const active = s.amenities.includes(a);
                const icon = AMENITY_ICONS[a];
                return (
                  <button
                    key={a}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggle(a)}
                    className={`flex min-h-[56px] items-center gap-2 rounded-xl border px-3 text-left transition active:scale-[0.98] ${
                      active ? "border-[#1677E8] bg-[#EAF3FF]" : "border-[#E3E8EF] bg-white"
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                        active ? "bg-[#1677E8] text-white" : "bg-[#F1F7FF] text-[#0F5BB5]"
                      }`}
                      aria-hidden
                    >
                      <Icon name={(icon ?? "check") as "check"} size={18} />
                    </span>
                    <span className={`text-[13.5px] font-bold leading-tight ${active ? "text-[#0F5BB5]" : ""}`}>
                      {a}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Chapter>
  );
}

/* Binary choice: tap to select, tap again to clear. No selection = unspecified. */
function BinaryChoice({
  label,
  hint,
  options,
  value,
  onPick,
}: {
  label: string;
  hint?: string;
  options: readonly [string, string];
  value: boolean | null;
  onPick: (v: boolean | null) => void;
}) {
  return (
    <div className="rounded-2xl border border-[#E3E8EF] bg-white p-4">
      <p className="text-[15px] font-bold">{label}</p>
      {hint && <p className="mt-0.5 text-[13px] text-[#5B6B7C]">{hint}</p>}
      <div
        className="mt-2.5 grid grid-cols-2 gap-1.5"
        role="radiogroup"
        aria-label={label}
      >
        {options.map((text, i) => {
          const v = i === 0;
          const active = value === v;
          return (
            <button
              key={text}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onPick(active ? null : v)}
              className={`min-h-[48px] rounded-xl border text-[14px] font-bold transition active:scale-[0.98] ${
                active
                  ? "border-[#1677E8] bg-[#EAF3FF] text-[#0F5BB5]"
                  : "border-[#E3E8EF] bg-white text-[#17202A]"
              }`}
            >
              {text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function WhoChapter({
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
  const s: SpaceState = draft.space;
  const setPolicy = (key: (typeof POLICY_ROWS)[number]["key"], v: Policy) =>
    save({ space: { ...s, policies: { ...s.policies, [key]: v } } });
  const isPgHostel =
    draft.place.buildingType === "PG" || draft.place.buildingType === "Hostel";

  const next = () => {
    if (!s.audience) return setError("Who is this place for? Pick one — you can change it later.");
    setError("");
    go("photos");
  };

  const foodOpts = [
    { v: "included", label: "Included in rent" },
    { v: "separate", label: "Available separately" },
    { v: "none", label: "No food" },
  ] as const;

  return (
    <Chapter
      id="who"
      kicker="The people"
      title="Who can stay?"
      error={error}
      onContinue={next}
      showBack
      onBack={back}
    >
      <BigChoices
        ariaLabel="Who can stay"
        value={s.audience}
        onPick={(v) => {
          save({ space: { ...s, audience: v as typeof s.audience } });
          setError("");
        }}
        options={[
          { value: "Anyone", title: "Anyone", body: "Open to every renter" },
          { value: "Men", title: "Men", body: "Men only" },
          { value: "Women", title: "Women", body: "Women only" },
        ]}
      />

      <h3 className="mb-1 mt-6 text-[13px] font-bold uppercase tracking-[0.12em] text-[#5B6B7C]">
        House rules
      </h3>
      <p className="mb-2.5 text-[14px] text-[#5B6B7C]">
        Let renters know what works for your place. You can skip anything.
      </p>
      <div className="space-y-2.5">
        <BinaryChoice
          label="Are couples allowed?"
          options={["Allowed", "Not allowed"]}
          value={s.policies.couples}
          onPick={(v) => setPolicy("couples", v)}
        />
        <BinaryChoice
          label="Can renters have visitors?"
          hint="Daytime guests, for example."
          options={["Allowed", "Not allowed"]}
          value={s.policies.visitors}
          onPick={(v) => setPolicy("visitors", v)}
        />
        <BinaryChoice
          label="Are pets allowed?"
          options={["Allowed", "Not allowed"]}
          value={s.policies.pets}
          onPick={(v) => setPolicy("pets", v)}
        />
        <BinaryChoice
          label="Is smoking allowed?"
          options={["Allowed", "Not allowed"]}
          value={s.policies.smoking}
          onPick={(v) => setPolicy("smoking", v)}
        />
        <BinaryChoice
          label="Is alcohol allowed?"
          options={["Allowed", "Not allowed"]}
          value={s.policies.alcohol}
          onPick={(v) => setPolicy("alcohol", v)}
        />
        <BinaryChoice
          label="Is this place fully independent?"
          hint="Private entrance and no shared living spaces with the owner."
          options={["Yes", "No"]}
          value={s.fullyIndependent}
          onPick={(v) => save({ space: { ...s, fullyIndependent: v } })}
        />

        {isPgHostel && (
          <div className="rounded-2xl border border-[#E3E8EF] bg-[#F1F7FF] p-4">
            <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#0F5BB5]">
              PG / hostel details
            </p>
            <p className="mt-3 text-[15px] font-bold">Is food provided?</p>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-3" role="radiogroup" aria-label="Food arrangement">
              {foodOpts.map((o) => {
                const active = s.pgFood === o.v;
                return (
                  <button
                    key={o.v}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() =>
                      save({ space: { ...s, pgFood: active ? "" : o.v } })
                    }
                    className={`min-h-[48px] rounded-xl border px-3 text-[13.5px] font-bold transition active:scale-[0.98] ${
                      active
                        ? "border-[#1677E8] bg-white text-[#0F5BB5] shadow-sm"
                        : "border-[#E3E8EF] bg-white text-[#17202A]"
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
            <div className="mt-3">
              <BinaryChoice
                label="Is there a curfew?"
                options={["Yes", "No"]}
                value={s.pgCurfew}
                onPick={(v) => save({ space: { ...s, pgCurfew: v } })}
              />
            </div>
            {s.pgCurfew === true && (
              <div className="mt-2.5">
                <label htmlFor="who-gate" className="mb-1 block text-[13.5px] font-bold">
                  What time does the gate close?
                </label>
                <input
                  id="who-gate"
                  type="time"
                  value={draft.place.gateTime}
                  onChange={(e) =>
                    save({ place: { ...draft.place, gateTime: e.target.value } })
                  }
                  className="min-h-[52px] w-full rounded-[14px] border border-[#E3E8EF] bg-white px-4 text-[15px] focus:border-[#1677E8] focus:outline-none sm:max-w-[220px]"
                />
                <p className="mt-1 text-[12.5px] text-[#5B6B7C]">
                  Same gate timing shown under Where — kept in one place.
                </p>
              </div>
            )}
          </div>
        )}

        <div>
          <label htmlFor="who-notes" className="mb-1.5 block text-[14px] font-bold">
            Anything else renters should know?
          </label>
          <p className="-mt-1 mb-1.5 text-[13px] text-[#5B6B7C]">
            Add any house rules or details that don&apos;t fit above.
          </p>
          <textarea
            id="who-notes"
            rows={3}
            maxLength={2000}
            placeholder="Water timings, quiet hours…"
            value={s.houseRules}
            onChange={(e) => save({ space: { ...s, houseRules: e.target.value.slice(0, 2000) } })}
            className="min-h-[96px] w-full rounded-[14px] border border-[#E3E8EF] bg-white px-4 py-3 text-[15px] placeholder:text-[#93A1B3] focus:border-[#1677E8] focus:outline-none"
          />
        </div>
      </div>
    </Chapter>
  );
}
