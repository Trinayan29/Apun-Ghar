"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { ChapterId } from "@/lib/listing-draft";

/** Small step indicator: dots + "Step X of N", never a trap. */
export function StepIndicator({
  chapters,
  current,
  onJump,
}: {
  chapters: { id: ChapterId; title: string }[];
  current: ChapterId;
  onJump: (id: ChapterId) => void;
}) {
  const idx = Math.max(
    0,
    chapters.findIndex((c) => c.id === current)
  );
  return (
    <nav aria-label="Listing progress" className="flex items-center gap-2">
      <div className="flex gap-1.5" aria-hidden>
        {chapters.map((c, i) => (
          <span
            key={c.id}
            className={`h-1.5 rounded-full transition-all ${
              i < idx ? "w-4 bg-brand-600" : i === idx ? "w-6 bg-brand-600" : "w-1.5 bg-line"
            }`}
          />
        ))}
      </div>
      <span className="text-[12.5px] font-semibold text-muted">
        Step {idx + 1} of {chapters.length}
      </span>
      <span className="sr-only">
        {chapters.map((c, i) => (
          <button key={c.id} type="button" onClick={() => onJump(c.id)}>
            {i + 1}. {c.title}
          </button>
        ))}
      </span>
    </nav>
  );
}

/** Section wrapper: kicker + title + lede, consistent rhythm. */
export function FormSection({
  id,
  kicker,
  title,
  lede,
  children,
}: {
  id: string;
  kicker: string;
  title: string;
  lede?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-label={title} className="scroll-mt-24">
      <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-brand-700">{kicker}</p>
      <h2 className="mt-1.5 text-[24px] font-bold leading-[1.15] tracking-tight lg:text-[28px]">
        {title}
      </h2>
      {lede && <p className="mt-2 max-w-xl text-[14.5px] leading-relaxed text-muted">{lede}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** Actions sit after content (never a fixed overlay covering it). */
export function WizardActions({
  onBack,
  backLabel = "Back",
  onContinue,
  continueLabel = "Save & continue",
}: {
  onBack?: () => void;
  backLabel?: string;
  onContinue: () => void;
  continueLabel?: string;
}) {
  return (
    <div className="mt-6 flex flex-col gap-2 pb-4 sm:flex-row">
      <button
        type="button"
        onClick={onContinue}
        className="flex min-h-[54px] items-center justify-center rounded-2xl bg-brand-600 px-8 text-[16px] font-bold text-white transition active:scale-[0.99] sm:min-w-[240px]"
      >
        {continueLabel}
      </button>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="flex min-h-[52px] items-center justify-center rounded-2xl border border-line bg-white px-6 text-[15px] font-bold transition active:scale-[0.99]"
        >
          {backLabel}
        </button>
      )}
    </div>
  );
}

/** Wizard page shell: back nav + progress + content column. */
export function WizardShell({
  backHref,
  title,
  subtitle,
  chapters,
  current,
  onJump,
  children,
}: {
  backHref: string;
  title: string;
  subtitle: string;
  chapters: { id: ChapterId; title: string }[];
  current: ChapterId;
  onJump: (id: ChapterId) => void;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col bg-paper text-ink">
      <header className="border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-5 py-3">
          <Link
            href={backHref}
            aria-label="Back to Studio"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-white transition active:scale-95"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M14.5 5 7.5 12l7 7" />
            </svg>
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14.5px] font-bold">{title}</p>
            <p className="truncate text-[12.5px] text-muted">{subtitle}</p>
          </div>
        </div>
        <div className="mx-auto w-full max-w-2xl px-5 pb-3">
          <StepIndicator chapters={chapters} current={current} onJump={onJump} />
        </div>
      </header>
      <div className="mx-auto w-full max-w-2xl flex-1 px-5 py-6">{children}</div>
    </main>
  );
}
