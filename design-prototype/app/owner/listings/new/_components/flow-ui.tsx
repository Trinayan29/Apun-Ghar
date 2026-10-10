"use client";

import styles from "../flow.module.css";
import Icon from "@/components/Icon";

/* ---------- Chapter: one conversational beat, actions after content ---------- */
export function Chapter({
  id,
  kicker,
  title,
  lede,
  children,
  error,
  onContinue,
  continueLabel = "Continue",
  showBack = false,
  onBack,
}: {
  id: string;
  kicker: string;
  title: string;
  lede?: string;
  children: React.ReactNode;
  error?: string;
  onContinue: () => void;
  continueLabel?: string;
  showBack?: boolean;
  onBack?: () => void;
}) {
  return (
    <section id={`chapter-${id}`} aria-label={title} className="scroll-mt-24">
      <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#1677E8]">{kicker}</p>
      <h2 className={`${styles.display} mt-1.5 text-[26px] leading-[1.15] text-[#17202A] lg:text-[30px]`}>
        {title}
      </h2>
      {lede && <p className="mt-2 max-w-xl text-[14.5px] leading-relaxed text-[#5B6B7C]">{lede}</p>}
      <div className="mt-5">{children}</div>
      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-[#FDECEA] px-3.5 py-2.5 text-[13.5px] font-medium text-[#C0352B]">
          {error}
        </p>
      )}
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onContinue}
          className="flex min-h-[52px] items-center justify-center rounded-[14px] bg-[#1677E8] px-8 text-[16px] font-bold text-white transition active:scale-[0.99] sm:w-auto sm:min-w-[220px]"
        >
          {continueLabel}
        </button>
        {showBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex min-h-[52px] items-center justify-center rounded-[14px] border border-[#E3E8EF] bg-white px-6 text-[15px] font-bold text-[#17202A] transition active:scale-[0.99]"
          >
            Back
          </button>
        )}
      </div>
    </section>
  );
}

/* ---------- Big selectable cards (single-select) ---------- */
export function BigChoices<T extends string>({
  options,
  value,
  onPick,
  ariaLabel,
  columns = 1,
  compact = false,
}: {
  options: readonly { value: T; title: string; body?: string; icon?: string }[];
  value: T | "";
  onPick: (v: T) => void;
  ariaLabel: string;
  columns?: 1 | 2;
  compact?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`grid gap-2.5 ${columns === 2 ? "sm:grid-cols-2" : ""}`}
    >
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onPick(o.value)}
            className={`border text-left transition active:scale-[0.99] ${
              compact ? "rounded-xl p-3" : "rounded-2xl p-4"
            } ${
              active
                ? "border-[#1677E8] bg-[#EAF3FF] shadow-[0_0_0_1px_#1677E8]"
                : "border-[#E3E8EF] bg-white"
            }`}
          >
            <span className="flex items-center gap-2.5">
              {o.icon && (
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    active ? "bg-[#1677E8] text-white" : "bg-[#F1F7FF] text-[#0F5BB5]"
                  }`}
                  aria-hidden
                >
                  <Icon name={o.icon as "home"} size={20} />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className={`block ${compact ? "text-[15px]" : "text-[17px]"} font-bold text-[#17202A]`}>
                  {o.title}
                </span>
                {o.body && (
                  <span className="mt-0.5 block text-[13px] leading-snug text-[#5B6B7C]">{o.body}</span>
                )}
              </span>
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                  active ? "border-[#1677E8] bg-[#1677E8] text-white" : "border-[#E3E8EF] text-transparent"
                }`}
                aria-hidden
              >
                <Icon name="check" size={13} />
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Radio rows: compact full-width single-select ---------- */
export function RadioRows<T extends string>({
  options,
  value,
  onPick,
  ariaLabel,
}: {
  options: readonly { value: T; title: string; body?: string }[];
  value: T | "";
  onPick: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="overflow-hidden rounded-2xl border border-[#E3E8EF] bg-white">
      {options.map((o, i) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onPick(o.value)}
            className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition active:bg-[#F1F7FF] ${
              i > 0 ? "border-t border-[#E3E8EF]" : ""
            } ${active ? "bg-[#EAF3FF]" : ""}`}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-bold text-[#17202A]">{o.title}</span>
              {o.body && <span className="block text-[13px] text-[#5B6B7C]">{o.body}</span>}
            </span>
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                active ? "border-[#1677E8]" : "border-[#DCE3EC]"
              }`}
              aria-hidden
            >
              {active && <span className="h-3 w-3 rounded-full bg-[#1677E8]" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Stepper (bathrooms etc.) ---------- */
export function Stepper({
  label,
  value,
  min = 0,
  max = 10,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  const btn =
    "flex h-12 w-12 items-center justify-center rounded-full border border-[#E3E8EF] bg-white text-[20px] font-bold text-[#1677E8] transition active:scale-90 disabled:opacity-30";
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#E3E8EF] bg-white px-4 py-3">
      <span className="text-[14.5px] font-semibold">{label}</span>
      <span className="flex items-center gap-3">
        <button type="button" aria-label={`Fewer ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)} className={btn}>
          −
        </button>
        <span className="w-6 text-center text-[17px] font-bold" aria-live="polite">{value}</span>
        <button type="button" aria-label={`More ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)} className={btn}>
          +
        </button>
      </span>
    </div>
  );
}

/* ---------- Switch row ---------- */
export function SwitchRow({
  label,
  hint,
  on,
  onFlip,
}: {
  label: string;
  hint?: string;
  on: boolean;
  onFlip: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onFlip}
      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[#E3E8EF] bg-white px-4 py-3 text-left transition active:scale-[0.99]"
    >
      <span>
        <span className="block text-[14px] font-bold">{label}</span>
        {hint && <span className="block text-[12.5px] text-[#5B6B7C]">{hint}</span>}
      </span>
      <span className={`flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition ${on ? "justify-end bg-[#1677E8]" : "justify-start bg-[#E3E8EF]"}`}>
        <span className="h-5 w-5 rounded-full bg-white shadow" />
      </span>
    </button>
  );
}

/* ---------- Plain field (label + input, new identity) ---------- */
export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[14px] font-bold text-[#17202A]">
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1.5 text-[12.5px] text-[#5B6B7C]">{hint}</p>}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-[13px] font-medium text-[#C0352B]">
          {error}
        </p>
      )}
    </div>
  );
}

export const inputCls = (hasError?: boolean) =>
  `min-h-[52px] w-full rounded-[14px] border bg-white px-4 text-[15.5px] text-[#17202A] placeholder:text-[#93A1B3] focus:outline-none focus:border-[#1677E8] ${
    hasError ? "border-[#B3261E]" : "border-[#E3E8EF]"
  }`;
