"use client";

import { useState } from "react";
import {
  suggestTitle,
  type FlowChapter,
  type ListingDraft,
} from "@/components/listing/types";
import { Chapter, Field, inputCls } from "../_components/flow-ui";

export function validateName(b: ListingDraft["basics"]): string {
  if (b.title.trim().length < 2) return "Give your place a title — even two words will do.";
  if (b.title.trim().length > 200) return "Keep the title under 200 characters.";
  return "";
}

export default function NameChapter({
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
  const b = draft.basics;
  const suggestion = suggestTitle(draft);
  const showSuggestion =
    suggestion.length >= 2 && b.title.trim().toLowerCase() !== suggestion.toLowerCase();

  return (
    <Chapter
      id="name"
      kicker="The finishing touch"
      title="Give your place a name"
      lede="No need to be clever — clear beats catchy. Start from our suggestion and make it yours."
      error={error}
      onContinue={() => {
        const e = validateName(b);
        if (e) return setError(e);
        setError("");
        go("listing");
      }}
      showBack
      onBack={back}
    >
      {showSuggestion && (
        <button
          type="button"
          onClick={() => {
            save({ basics: { ...b, title: suggestion } });
            setError("");
          }}
          className="mb-3 w-full rounded-2xl border border-dashed border-[#1677E8] bg-[#F1F7FF] p-4 text-left transition active:scale-[0.99]"
        >
          <span className="block text-[12px] font-bold uppercase tracking-[0.12em] text-[#1677E8]">
            Suggested for you — tap to use
          </span>
          <span className="mt-1 block text-[16px] font-bold">{suggestion}</span>
        </button>
      )}

      <Field id="nm-title" label="Title">
        <input
          id="nm-title"
          value={b.title}
          maxLength={200}
          placeholder="e.g. Sunny 2 BHK near Six Mile"
          onChange={(e) => {
            save({ basics: { ...b, title: e.target.value.slice(0, 200) } });
            setError("");
          }}
          className={inputCls(!!error)}
        />
        <span className="mt-1 block text-right text-[12px] text-[#5B6B7C]">
          {b.title.trim().length}/200
        </span>
      </Field>

      <div className="mt-4">
        <label htmlFor="nm-desc" className="mb-1.5 block text-[14px] font-bold">
          Tell renters a little more <span className="font-normal text-[#5B6B7C]">(optional)</span>
        </label>
        <textarea
          id="nm-desc"
          rows={4}
          placeholder="What's nearby? What's included? Anything about food, timings, parking or the neighbourhood?"
          value={b.description}
          onChange={(e) => save({ basics: { ...b, description: e.target.value } })}
          className="min-h-[112px] w-full rounded-[14px] border border-[#E3E8EF] bg-white px-4 py-3 text-[15px] placeholder:text-[#93A1B3] focus:border-[#1677E8] focus:outline-none"
        />
        <p className="mt-1.5 text-[12.5px] text-[#5B6B7C]">
          Three honest lines beat a formal brochure. Write like you&apos;d tell a neighbour.
        </p>
      </div>
    </Chapter>
  );
}
