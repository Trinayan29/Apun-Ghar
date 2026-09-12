"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApp } from "@/store/AppStore";
import { AREAS, COLLEGES } from "@/data/properties";
import Icon from "@/components/Icon";
import { PrimaryButton } from "@/components/ui";

const ROOM_TYPES = ["Private room", "Shared room", "PG", "Hostel", "Flat / apartment"];
const BUDGETS = [5000, 8000, 10000, 15000, 20000];
const MOVE_INS = ["Immediately", "Within 2 weeks", "Within a month", "Just exploring"];

export default function Onboarding() {
  const router = useRouter();
  const { onboarding, setOnboarding, setAnchor } = useApp();
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<"college" | "workplace">("college");

  const canContinue =
    step === 0 ? onboarding.roomType !== "" :
    step === 1 ? onboarding.place !== "" :
    step === 2 ? onboarding.budget !== null : true;

  const finish = () => {
    if (onboarding.place) setAnchor(onboarding.place);
    router.push("/home");
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-6 pb-8 pt-10">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold text-muted">
          {step + 1} of 4
        </p>
        <button onClick={finish} className="text-[13.5px] font-semibold text-brand-700">
          Skip
        </button>
      </div>
      <div className="mt-2 flex gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-brand-600" : "bg-line"}`} />
        ))}
      </div>

      {step === 0 && (
        <div className="mt-8">
          <h1 className="text-[24px] font-bold tracking-tight">What are you looking for?</h1>
          <p className="mt-1 text-[14.5px] text-muted">Pick the one that fits best for now.</p>
          <div className="mt-6 space-y-3">
            {ROOM_TYPES.map((r) => (
              <button
                key={r}
                onClick={() => setOnboarding({ roomType: r })}
                className={`flex min-h-[58px] w-full items-center justify-between rounded-2xl border px-4 text-[15px] font-semibold transition active:scale-[0.98] ${
                  onboarding.roomType === r ? "border-brand-700 bg-brand-50 text-brand-800" : "border-line bg-white text-ink"
                }`}
              >
                <span className="inline-flex items-center gap-3">
                  <Icon name="bed" size={20} className={onboarding.roomType === r ? "text-brand-700" : "text-muted"} />
                  {r}
                </span>
                {onboarding.roomType === r && <Icon name="check" size={20} className="text-brand-700" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="mt-8">
          <h1 className="text-[24px] font-bold tracking-tight">Where do you spend most of your time?</h1>
          <p className="mt-1 text-[14.5px] text-muted">We&apos;ll measure every distance from here.</p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            {(["college", "workplace"] as const).map((k) => (
              <button
                key={k}
                onClick={() => { setKind(k); setOnboarding({ place: "" }); }}
                className={`flex min-h-[96px] flex-col items-center justify-center gap-2 rounded-2xl border text-[14.5px] font-semibold capitalize transition active:scale-[0.98] ${
                  kind === k ? "border-brand-700 bg-brand-50 text-brand-800" : "border-line bg-white text-ink"
                }`}
              >
                <Icon name={k === "college" ? "grad" : "brief"} size={26} className={kind === k ? "text-brand-700" : "text-muted"} />
                {k}
              </button>
            ))}
          </div>
          <div className="mt-4 space-y-2.5">
            {(kind === "college" ? COLLEGES : [...AREAS.map((a) => `${a} offices`), "Dispur Secretariat", "GNRC Hospital"]).map((c) => (
              <button
                key={c}
                onClick={() => setOnboarding({ place: c })}
                className={`flex min-h-[52px] w-full items-center justify-between rounded-xl border px-4 text-left text-[14.5px] font-medium transition active:scale-[0.99] ${
                  onboarding.place === c ? "border-brand-700 bg-brand-50 text-brand-800" : "border-line bg-white text-ink"
                }`}
              >
                {c}
                {onboarding.place === c && <Icon name="check" size={18} className="text-brand-700" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="mt-8">
          <h1 className="text-[24px] font-bold tracking-tight">What&apos;s your monthly budget?</h1>
          <p className="mt-1 text-[14.5px] text-muted">Total monthly cost, not just rent.</p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            {BUDGETS.map((b) => (
              <button
                key={b}
                onClick={() => setOnboarding({ budget: b })}
                className={`min-h-[72px] rounded-2xl border text-[16px] font-bold transition active:scale-[0.97] ${
                  onboarding.budget === b ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-white text-ink"
                }`}
              >
                Under ₹{(b / 1000).toFixed(0)}k
              </button>
            ))}
          </div>
          <button
            onClick={() => setOnboarding({ budget: 25000 })}
            className={`mt-3 min-h-[60px] w-full rounded-2xl border text-[15px] font-semibold transition ${
              onboarding.budget === 25000 ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-white text-ink"
            }`}
          >
            Flexible / exploring
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="mt-8">
          <h1 className="text-[24px] font-bold tracking-tight">When are you moving?</h1>
          <p className="mt-1 text-[14.5px] text-muted">We&apos;ll only show places available in time.</p>
          <div className="mt-6 space-y-3">
            {MOVE_INS.map((m) => (
              <button
                key={m}
                onClick={() => setOnboarding({ moveIn: m })}
                className={`flex min-h-[58px] w-full items-center justify-between rounded-2xl border px-4 text-[15px] font-semibold transition active:scale-[0.98] ${
                  onboarding.moveIn === m ? "border-brand-700 bg-brand-50 text-brand-800" : "border-line bg-white text-ink"
                }`}
              >
                <span className="inline-flex items-center gap-3">
                  <Icon name="calendar" size={20} className={onboarding.moveIn === m ? "text-brand-700" : "text-muted"} />
                  {m}
                </span>
                {onboarding.moveIn === m && <Icon name="check" size={20} className="text-brand-700" />}
              </button>
            ))}
          </div>
          <div className="mt-6 rounded-2xl bg-brand-50 p-4">
            <p className="text-[13.5px] leading-relaxed text-brand-800">
              <span className="font-bold">You&apos;re all set.</span> We found 24 places near {onboarding.place || "your campus"} within your budget.
            </p>
          </div>
        </div>
      )}

      <div className="mt-auto flex gap-3 pt-8">
        {step > 0 && (
          <button
            onClick={() => setStep(step - 1)}
            className="flex min-h-[54px] items-center gap-1 rounded-2xl border border-line bg-white px-5 text-[15px] font-semibold text-ink"
          >
            <Icon name="back" size={18} /> Back
          </button>
        )}
        <div className="flex-1">
          <PrimaryButton
            disabled={!canContinue}
            onClick={() => (step === 3 ? finish() : setStep(step + 1))}
          >
            {step === 3 ? "Show my places" : "Continue"}
          </PrimaryButton>
        </div>
      </div>
    </main>
  );
}
