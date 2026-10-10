"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import {
  CHARGE_LABELS,
  inr,
  isWholeHome,
  parseRs,
  priceSummary,
  type ChargeKind,
  type FlowChapter,
  type Frequency,
  type ListingDraft,
  type PriceRow,
} from "@/components/listing/types";
import { Chapter, inputCls } from "../_components/flow-ui";

function uid(): string {
  return `pr-${Math.random().toString(36).slice(2, 9)}`;
}

const EXTRA_CHOICES: ChargeKind[] = ["food", "maintenance", "electricity", "water", "internet", "other"];

export function validateCost(d: ListingDraft): string {
  const rent = d.prices.find((p) => p.kind === "rent");
  if (!rent || parseRs(rent.amount) === null) return "Add a monthly rent before continuing.";
  const seen = new Set<string>();
  for (const p of d.prices) {
    const key = `${p.kind}|${p.frequency}`;
    if (seen.has(key)) return "Two rows describe the same charge — keep just one.";
    seen.add(key);
    if (p.kind === "other" && p.label.trim().length < 2)
      return "Name your “Other” charge so renters know what it is.";
    if (p.metered) {
      if (parseRs(p.rate) === null) return "Add the per-unit rate for the metered charge.";
    } else if (parseRs(p.amount) === null) return "Fill the amount on every charge row.";
  }
  return "";
}

function basisFor(d: ListingDraft): "person" | "room" | "place" {
  const k = d.space.kind;
  if (isWholeHome(k)) return "place";
  if (k === "Shared room" || k === "Bed in PG / Hostel") return "person";
  const b = d.basics.rentBasis;
  if (b === "room") return "room";
  return "person";
}

export default function PriceChapter({
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
  const basis = basisFor(draft);
  const fixedBasis = isWholeHome(draft.space.kind);
  const rent = draft.prices.find((p) => p.kind === "rent");
  const deposit = draft.prices.find((p) => p.kind === "deposit");
  const extras = draft.prices.filter((p) => p.kind !== "rent" && p.kind !== "deposit");
  const summary = priceSummary(draft);
  const [addingDeposit, setAddingDeposit] = useState(false);

  const setPrices = (prices: PriceRow[]) => save({ prices });

  const ensureRent = (amount: string): PriceRow[] => {
    if (rent) return draft.prices.map((p) => (p.id === rent.id ? { ...p, amount } : p));
    return [
      {
        id: uid(), kind: "rent", label: "", amount,
        frequency: "monthly", metered: false, rate: "",
        mandatory: true, included: true, refundable: false,
      } as PriceRow,
      ...draft.prices,
    ];
  };

  const setBasis = (b: "person" | "room") => {
    save({ basics: { ...draft.basics, rentBasis: b } });
  };

  const basisValue = draft.basics.rentBasis === "room" ? "room" : basis === "place" ? "" : "person";

  return (
    <Chapter
      id="price"
      kicker="The money part"
      title="How much does the place cost?"
      lede="Start with the rent. Everything else is optional — and always shown plainly."
      error={error}
      onContinue={() => {
        const e = validateCost({ ...draft, basics: { ...draft.basics, rentBasis: fixedBasis ? "place" : draft.basics.rentBasis || basis } });
        if (e) return setError(e);
        if (!draft.basics.rentBasis)
          save({ basics: { ...draft.basics, rentBasis: fixedBasis ? "place" : basis } });
        setError("");
        go("movein");
      }}
      showBack
      onBack={back}
    >
      <label htmlFor="pc-rent" className="mb-1.5 block text-[14px] font-bold">
        Monthly rent
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-[26px] font-bold text-[#93A1B3]">
          ₹
        </span>
        <input
          id="pc-rent"
          inputMode="numeric"
          placeholder="8,000"
          value={rent?.amount ?? ""}
          onChange={(e) => setPrices(ensureRent(e.target.value.replace(/[^0-9]/g, "").slice(0, 8)))}
          className="min-h-[68px] w-full rounded-2xl border-2 border-[#E3E8EF] bg-white pl-12 pr-4 text-[30px] font-bold placeholder:font-normal placeholder:text-[#93A1B3] focus:border-[#1677E8] focus:outline-none"
        />
      </div>

      {!fixedBasis ? (
        <div className="mt-4" role="radiogroup" aria-label="How is this rent charged">
          <p className="mb-1.5 text-[14px] font-bold">How is this rent charged?</p>
          <div className="grid grid-cols-2 gap-2">
            {(["person", "room"] as const).map((b) => {
              const active = (basisValue || "person") === b;
              return (
                <button
                  key={b}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setBasis(b)}
                  className={`min-h-[52px] rounded-[14px] border text-[14.5px] font-bold transition active:scale-[0.98] ${
                    active ? "border-[#1677E8] bg-[#EAF3FF] text-[#0F5BB5]" : "border-[#E3E8EF] bg-white"
                  }`}
                >
                  {b === "person" ? "Per person" : "Per room"}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="mt-2 text-[13.5px] text-[#5B6B7C]">
          Per month, for the whole place — no per-person maths needed.
        </p>
      )}

      <div className="mt-4 rounded-2xl border border-[#E3E8EF] bg-white p-4">
        <p className="text-[14.5px] font-bold">Is there a security deposit?</p>
        {!deposit && !addingDeposit ? (
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setAddingDeposit(true)}
              className="min-h-[48px] rounded-xl border border-[#E3E8EF] text-[14px] font-bold transition active:scale-[0.98]"
            >
              Yes, add it
            </button>
            <span className="flex min-h-[48px] items-center justify-center rounded-xl bg-[#EAF3FF] text-[14px] font-bold text-[#5B6B7C]">
              No deposit
            </span>
          </div>
        ) : (
          <div className="mt-2.5">
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[15px] font-bold text-[#93A1B3]">₹</span>
              <input
                inputMode="numeric"
                aria-label="Security deposit amount"
                placeholder="10,000"
                value={deposit?.amount ?? ""}
                onChange={(e) => {
                  const amount = e.target.value.replace(/[^0-9]/g, "").slice(0, 8);
                  if (deposit) setPrices(draft.prices.map((p) => (p.id === deposit.id ? { ...p, amount } : p)));
                  else
                    setPrices([
                      ...draft.prices,
                      { id: uid(), kind: "deposit", label: "", amount, frequency: "once", metered: false, rate: "", mandatory: true, included: false, refundable: true },
                    ]);
                }}
                className={`${inputCls()} pl-9 text-[17px] font-bold`}
              />
            </div>
            <p className="mt-1.5 text-[12.5px] text-[#5B6B7C]">Refundable · collected once, at move-in.</p>
          </div>
        )}
      </div>

      <div className="mt-4">
        <p className="mb-1.5 text-[14px] font-bold">
          Anything else renters pay? <span className="font-normal text-[#5B6B7C]">(optional)</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {EXTRA_CHOICES.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() =>
                setPrices([
                  ...draft.prices,
                  {
                    id: uid(), kind: k, label: "",
                    amount: "", frequency: k === "electricity" ? "metered" : "monthly",
                    metered: k === "electricity", rate: "",
                    mandatory: true, included: k !== "electricity", refundable: false,
                  },
                ])
              }
              className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#E3E8EF] bg-white px-3.5 text-[14px] font-semibold transition active:scale-[0.97]"
            >
              <Icon name="plus" size={15} className="text-[#1677E8]" />
              {CHARGE_LABELS[k]}
            </button>
          ))}
        </div>

        {extras.map((row) => (
          <div key={row.id} className="mt-2.5 space-y-2.5 rounded-2xl border border-[#E3E8EF] bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[14.5px] font-bold">
                {row.kind === "other" ? "Custom charge" : CHARGE_LABELS[row.kind]}
              </p>
              <button
                type="button"
                aria-label="Remove charge"
                onClick={() => setPrices(draft.prices.filter((p) => p.id !== row.id))}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-[#5B6B7C]"
              >
                <Icon name="close" size={17} />
              </button>
            </div>
            {row.kind === "other" && (
              <input
                aria-label="Charge name"
                placeholder="Name it, e.g. Cleaning"
                value={row.label}
                onChange={(e) =>
                  setPrices(draft.prices.map((p) => (p.id === row.id ? { ...p, label: e.target.value.slice(0, 60) } : p)))
                }
                className={inputCls()}
              />
            )}
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="How often">
              {(Object.keys({
                monthly: 1, quarterly: 1, yearly: 1, once: 1, metered: 1,
              }) as Frequency[]).map((f) => {
                const label = { monthly: "Monthly", quarterly: "Quarterly", yearly: "Yearly", once: "One-time", metered: "As used" }[f];
                const active = row.frequency === f;
                return (
                  <button
                    key={f}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() =>
                      setPrices(
                        draft.prices.map((p) =>
                          p.id === row.id ? { ...p, frequency: f, metered: f === "metered" } : p
                        )
                      )
                    }
                    className={`min-h-[44px] rounded-xl border px-3.5 text-[13.5px] font-bold transition active:scale-95 ${
                      active ? "border-[#1677E8] bg-[#1677E8] text-white" : "border-[#E3E8EF] bg-white"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {row.metered ? (
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[15px] font-bold text-[#93A1B3]">₹</span>
                <input
                  inputMode="numeric"
                  aria-label="Rate per unit"
                  placeholder="Rate per unit, e.g. 8"
                  value={row.rate}
                  onChange={(e) =>
                    setPrices(draft.prices.map((p) => (p.id === row.id ? { ...p, rate: e.target.value.replace(/[^0-9]/g, "").slice(0, 6) } : p)))
                  }
                  className={`${inputCls()} pl-9 font-bold`}
                />
              </div>
            ) : (
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[15px] font-bold text-[#93A1B3]">₹</span>
                <input
                  inputMode="numeric"
                  aria-label="Charge amount"
                  placeholder="Amount"
                  value={row.amount}
                  onChange={(e) =>
                    setPrices(draft.prices.map((p) => (p.id === row.id ? { ...p, amount: e.target.value.replace(/[^0-9]/g, "").slice(0, 8) } : p)))
                  }
                  className={`${inputCls()} pl-9 font-bold`}
                />
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                aria-pressed={row.mandatory}
                onClick={() => setPrices(draft.prices.map((p) => (p.id === row.id ? { ...p, mandatory: !p.mandatory } : p)))}
                className={`min-h-[44px] rounded-xl border px-3.5 text-[13px] font-bold ${row.mandatory ? "border-[#1677E8] bg-[#EAF3FF] text-[#0F5BB5]" : "border-[#E3E8EF] bg-white"}`}
              >
                {row.mandatory ? "Everyone pays" : "Optional add-on"}
              </button>
              <button
                type="button"
                aria-pressed={row.included}
                onClick={() => setPrices(draft.prices.map((p) => (p.id === row.id ? { ...p, included: !p.included } : p)))}
                className={`min-h-[44px] rounded-xl border px-3.5 text-[13px] font-bold ${row.included ? "border-[#1677E8] bg-[#EAF3FF] text-[#0F5BB5]" : "border-[#E3E8EF] bg-white"}`}
              >
                {row.included ? "In headline price" : "Shown as extra"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-[#17202A] p-5 text-white">
        <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-white/60">What the renter will pay</p>
        <p className="mt-1 text-[30px] font-bold">
          {summary.headline > 0 ? inr(summary.headline) : "—"}
          <span className="text-[15px] font-semibold text-white/70"> / month</span>
        </p>
        {summary.extras > 0 && (
          <p className="mt-1 text-[13.5px] text-white/75">+ {inr(summary.extras)} extras</p>
        )}
        {summary.meteredCount > 0 && (
          <p className="mt-0.5 text-[13.5px] text-white/75">+ pay-as-used charges billed separately</p>
        )}
        {summary.deposit > 0 && (
          <p className="mt-2 border-t border-white/15 pt-2 text-[13.5px] text-white/85">
            Security deposit · {inr(summary.deposit)} refundable
          </p>
        )}
      </div>
    </Chapter>
  );
}
