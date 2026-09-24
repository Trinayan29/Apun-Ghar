"use client";

function CheckDot({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition ${
        active ? "border-brand-600 bg-brand-600 text-white" : "border-line text-transparent"
      }`}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
        <path d="m4.5 12.5 5 5 10-11" />
      </svg>
    </span>
  );
}

export interface ChoiceOption<T extends string> {
  value: T;
  title: string;
  body?: string;
}

/** Large single-select cards (e.g. "What are you renting?"). */
export function ChoiceCard<T extends string>({
  option,
  active,
  onPick,
}: {
  option: ChoiceOption<T>;
  active: boolean;
  onPick: (value: T) => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={() => onPick(option.value)}
      className={`rounded-2xl border p-4 text-left transition active:scale-[0.99] ${
        active
          ? "border-brand-600 bg-brand-50 shadow-[0_0_0_1px_var(--color-brand-600)]"
          : "border-line bg-white"
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-[16px] font-bold tracking-tight">{option.title}</span>
        <CheckDot active={active} />
      </span>
      {option.body && (
        <span className="mt-0.5 block text-[13.5px] leading-snug text-muted">{option.body}</span>
      )}
    </button>
  );
}

/** Responsive grid of ChoiceCards (1 col mobile, 2 col sm+). */
export function ChoiceGrid<T extends string>({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: readonly ChoiceOption<T>[];
  value: T | "";
  onPick: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2.5 sm:grid-cols-2">
      {options.map((o) => (
        <ChoiceCard key={o.value} option={o} active={value === o.value} onPick={onPick} />
      ))}
    </div>
  );
}

/**
 * Choice with tap-to-clear: selecting the active option returns to
 * "not specified" (null/""). Powers Allowed/Not allowed, Yes/No and
 * similar optional questions. Never invents a default.
 */
export function ClearableChoice<T extends string | boolean>({
  label,
  hint,
  options,
  value,
  clearValue,
  onPick,
}: {
  label: string;
  hint?: string;
  options: readonly { value: Exclude<T, null | "">; label: string }[];
  value: T | null | "";
  /** Value written when the active option is tapped again (the "unspecified" state). */
  clearValue: T | null | "";
  onPick: (value: T | null | "") => void;
}) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <p className="text-[14.5px] font-bold">{label}</p>
      {hint && <p className="mt-0.5 text-[13px] text-muted">{hint}</p>}
      <div
        className={`mt-2.5 grid gap-1.5 ${
          options.length > 2 ? "sm:grid-cols-3" : "grid-cols-2"
        }`}
        role="radiogroup"
        aria-label={label}
      >
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onPick(active ? clearValue : o.value)}
              className={`min-h-[48px] rounded-xl border text-[13.5px] font-bold transition active:scale-[0.97] ${
                active
                  ? "border-brand-600 bg-brand-50 text-brand-700"
                  : "border-line bg-white"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Numeric stepper (e.g. bathroom count). Minus/plus with an explicit value. */
export function Stepper({
  label,
  value,
  min = 0,
  max = 6,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4">
      <span className="text-[14px] font-semibold">{label}</span>
      <span className="flex items-center gap-3" role="group" aria-label={label}>
        <button
          type="button"
          aria-label={`Fewer ${label}`}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-white text-[20px] font-bold transition active:scale-95 disabled:opacity-30"
        >
          −
        </button>
        <span className="w-6 text-center text-[16px] font-bold" aria-live="polite">
          {value}
        </span>
        <button
          type="button"
          aria-label={`More ${label}`}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-white text-[20px] font-bold transition active:scale-95"
        >
          +
        </button>
      </span>
    </div>
  );
}

/** Compact segmented strip (e.g. bed counts). Joined container, one control. */
export function SegmentedStrip<T extends string | number>({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T | null;
  onPick: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1.5 rounded-2xl border border-line bg-white p-1.5">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onPick(o.value)}
            className={`min-h-[52px] rounded-xl text-[15px] font-bold transition active:scale-[0.97] ${
              active ? "bg-brand-600 text-white shadow-sm" : "text-muted"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
