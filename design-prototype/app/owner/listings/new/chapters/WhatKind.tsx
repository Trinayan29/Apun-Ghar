"use client";

import { useState } from "react";
import {
  BUILDING_TYPES,
  SPACE_KINDS,
  isWholeHome,
  needsBeds,
  type BuildingType,
  type FlowChapter,
  type ListingDraft,
  type SpaceKind,
} from "@/components/listing/types";
import { BigChoices, Chapter, inputCls } from "../_components/flow-ui";

function inferSharing(kind: SpaceKind | ""): "private" | "shared" | null {
  if (kind === "Single room") return "private";
  if (kind === "Shared room" || kind === "Bed in PG / Hostel") return "shared";
  return null;
}

export function WhatChapter({
  draft,
  save,
  go,
}: {
  draft: ListingDraft;
  save: (patch: Partial<ListingDraft>) => void;
  go: (c: FlowChapter) => void;
}) {
  const [error, setError] = useState("");
  const s = draft.space;

  const pick = (kind: SpaceKind) => {
    save({
      space: {
        ...s,
        kind,
        whatDetail: kind === "Something else" ? s.whatDetail : "",
        occupancy:
          kind === "Single room" ? 1 : isWholeHome(kind) ? null : s.occupancy,
        beds: needsBeds(kind) ? s.beds : null,
        layout: isWholeHome(kind) ? kind : "",
        sharing: inferSharing(kind),
      },
    });
    setError("");
  };

  const next = () => {
    if (!s.kind) return setError("Choose what you're renting — everything after this adapts to it.");
    if (needsBeds(s.kind) && s.beds === null)
      return setError("How many beds are in this room? Pick one below.");
    if (s.kind === "Something else" && s.whatDetail.trim().length < 2)
      return setError("Tell us what you're renting in a few words.");
    go("kind");
  };

  return (
    <Chapter
      id="what"
      kicker="First things first"
      title="What are you renting?"
      lede="Pick the closest match. The next questions adapt to exactly this — nothing extra."
      error={error}
      onContinue={next}
    >
      <BigChoices
        ariaLabel="What are you renting"
        value={s.kind}
        onPick={pick}
        options={SPACE_KINDS.map((o) => ({ value: o.kind, title: o.kind, body: o.hint }))}
        columns={2}
      />
      {s.kind === "Something else" && (
        <div className="mt-3">
          <label htmlFor="what-detail" className="mb-1.5 block text-[14px] font-bold">
            What are you renting?
          </label>
          <input
            id="what-detail"
            value={s.whatDetail}
            maxLength={80}
            placeholder="e.g. A shop shutter with a loft"
            onChange={(e) => {
              save({ space: { ...s, whatDetail: e.target.value.slice(0, 80) } });
              setError("");
            }}
            className={inputCls()}
          />
        </div>
      )}
      {needsBeds(s.kind) && (
        <div className="mt-4 rounded-2xl border border-[#E3E8EF] bg-white p-4">
          <p className="text-[14.5px] font-bold">How many beds are in this room?</p>
          <div className="mt-2.5 flex gap-2" role="radiogroup" aria-label="Beds in room">
            {[2, 3, 4, 5].map((n) => {
              const active = s.beds === n;
              return (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    save({
                      space: { ...s, beds: n, occupancy: n >= 4 ? 4 : (n as 2 | 3), sharing: "shared" },
                    });
                    setError("");
                  }}
                  className={`flex h-[52px] flex-1 items-center justify-center rounded-[14px] border text-[16px] font-bold transition active:scale-95 ${
                    active ? "border-[#1677E8] bg-[#EAF3FF] text-[#0F5BB5]" : "border-[#E3E8EF] bg-white"
                  }`}
                >
                  {n === 5 ? "5+" : n}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Chapter>
  );
}

const BUILDING_COPY: Record<BuildingType, { title: string; body: string }> = {
  PG: { title: "PG", body: "Paying guest accommodation" },
  Hostel: { title: "Hostel", body: "Shared accommodation with rooms or beds" },
  Apartment: { title: "Apartment", body: "Flat in an apartment building" },
  "Room in a house": { title: "Room in a house", body: "A room you're renting inside a house" },
  "Assam-type house": { title: "Assam-type house", body: "Traditional, local standalone house" },
  Other: { title: "Other", body: "Tell us what it is" },
};

export function KindChapter({
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

  const next = () => {
    if (!draft.place.buildingType)
      return setError("Pick the closest match — you can refine the details later.");
    if (draft.place.buildingType === "Other" && draft.space.buildingOther.trim().length < 2)
      return setError("Tell us what kind of place it is.");
    go("where");
  };

  return (
    <Chapter
      id="kind"
      kicker="The building"
      title="What kind of place is it?"
      lede="This is about the building — the room or flat itself comes next."
      error={error}
      onContinue={next}
      showBack
      onBack={back}
    >
      <BigChoices
        ariaLabel="Building type"
        value={draft.place.buildingType}
        onPick={(v) => {
          const staysPgHostel = v === "PG" || v === "Hostel";
          save({
            place: { ...draft.place, buildingType: v },
            space: {
              ...draft.space,
              buildingOther: v === "Other" ? draft.space.buildingOther : "",
              pgFood: staysPgHostel ? draft.space.pgFood : "",
              pgCurfew: staysPgHostel ? draft.space.pgCurfew : null,
            },
          });
          setError("");
        }}
        options={BUILDING_TYPES.map((b) => ({
          value: b,
          title: BUILDING_COPY[b].title,
          body: BUILDING_COPY[b].body,
        }))}
        columns={2}
        compact
      />
      {draft.place.buildingType === "Other" && (
        <div className="mt-3">
          <label htmlFor="kind-other" className="mb-1.5 block text-[14px] font-bold">
            What kind of place is it?
          </label>
          <input
            id="kind-other"
            value={draft.space.buildingOther}
            maxLength={80}
            placeholder="e.g. Farmhouse outhouse"
            onChange={(e) => {
              save({ space: { ...draft.space, buildingOther: e.target.value.slice(0, 80) } });
              setError("");
            }}
            className={inputCls()}
          />
        </div>
      )}
    </Chapter>
  );
}
