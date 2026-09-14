"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand";

/* ---------- Phone helpers (backend: ^\+?[0-9]{7,15}$) ---------- */

/** Strip spaces, dashes, dots, parens so users can type naturally. */
export function normalizePhone(v: string): string {
  return v.replace(/[\s\-.()]/g, "");
}

export function isValidPhone(v: string): boolean {
  return /^\+?[0-9]{7,15}$/.test(normalizePhone(v));
}

/* ---------- Owner brand row ---------- */

export function OwnerBrand({ backHref = "/" }: { backHref?: string }) {
  return (
    <div className="flex items-center justify-between">
      <Link href={backHref} aria-label="Apun-Ghar home">
        <BrandMark />
      </Link>
      <span className="rounded-full border border-line bg-white px-3 py-1.5 text-[11.5px] font-bold uppercase tracking-widest text-brand-700">
        For owners
      </span>
    </div>
  );
}

/* ---------- Owner auth shell (email/phone-first, owner panel copy) ---------- */

export function OwnerAuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col bg-paper text-ink lg:grid lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-brand-800 p-10 text-white lg:flex">
        <OwnerBrandDark />
        <div>
          <p className="max-w-sm text-[26px] font-bold leading-snug">
            List your property on Apun-Ghar.
          </p>
          <p className="mt-2 max-w-sm text-[14.5px] leading-relaxed text-white/75">
            Reach students and young professionals already looking near your
            place — by budget, college, or workplace.
          </p>
        </div>
        <p className="text-[12.5px] text-white/60">
          Owner Studio: your properties, enquiries, and visits in one place.
        </p>
      </div>

      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col px-6 pb-8 pt-8 lg:justify-center lg:py-12">
        <div className="lg:hidden">
          <OwnerBrand />
        </div>
        <h1 className="mt-6 text-[24px] font-bold tracking-tight lg:mt-0">
          {title}
        </h1>
        <p className="mt-1 text-[14px] text-muted">{subtitle}</p>
        <div className="mt-6">{children}</div>
        <div className="mt-auto pt-8 text-center text-[14px] text-muted lg:mt-6">
          {footer}
        </div>
      </div>
    </main>
  );
}

function OwnerBrandDark() {
  return (
    <div className="flex items-center justify-between">
      <Link href="/" className="text-[19px] font-bold tracking-tight">
        Apun-Ghar
      </Link>
      <span className="rounded-full border border-white/25 px-3 py-1.5 text-[11.5px] font-bold uppercase tracking-widest text-white/85">
        For owners
      </span>
    </div>
  );
}

/* ---------- Account-type conflict (real backend 409, session stays alive) ---------- */

export function OwnerConflictNotice({
  email,
  onSignOut,
  signingOut,
  variant,
  onUseDifferentEmail,
}: {
  email: string;
  onSignOut: () => void;
  signingOut: boolean;
  variant: "signup" | "login";
  onUseDifferentEmail?: () => void;
}) {
  return (
    <div role="alert" className="rounded-2xl border border-line bg-white p-5">
      <span
        aria-hidden
        className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle
            cx="12"
            cy="8"
            r="3.6"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M5 19.5c1.2-3.2 3.9-5 7-5s5.8 1.8 7 5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <h2 className="mt-3 text-[17px] font-bold tracking-tight">
        This sign-in is already registered as a renter account.
      </h2>
      <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
        {email ? (
          <>
            <span className="font-semibold text-ink">{email}</span> is used for
            finding a place.{" "}
          </>
        ) : null}
        Owner and renter accounts are separate — one sign-in can&apos;t do
        both. To manage properties, use a different email for your owner
        account.
      </p>
      <div className="mt-4 space-y-2.5">
        <Link
          href="/login"
          className="flex min-h-[48px] items-center justify-center rounded-xl bg-brand-600 px-5 text-[15px] font-bold text-white transition active:scale-[0.98]"
        >
          Go to renter sign-in
        </Link>
        {variant === "login" ? (
          <button
            type="button"
            onClick={onUseDifferentEmail ?? onSignOut}
            disabled={signingOut}
            className="flex min-h-[48px] w-full items-center justify-center rounded-xl border border-line bg-white px-5 text-[15px] font-semibold transition active:scale-[0.98] disabled:opacity-60"
          >
            {signingOut ? "Signing out…" : "Use a different email"}
          </button>
        ) : (
          <button
            type="button"
            onClick={onSignOut}
            disabled={signingOut}
            className="flex min-h-[48px] w-full items-center justify-center rounded-xl border border-line bg-white px-5 text-[15px] font-semibold transition active:scale-[0.98] disabled:opacity-60"
          >
            {signingOut ? "Signing out…" : "Sign out and try another email"}
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- Dashboard / account atoms (honest empty states only) ---------- */

export function OwnerSectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-1 text-[12.5px] font-bold uppercase tracking-widest text-muted">
      {children}
    </p>
  );
}

export function ComingSoonPill() {
  return (
    <span className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-brand-700">
      Coming soon
    </span>
  );
}

export function OwnerEmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-white/60 px-5 py-8 text-center">
      <span
        aria-hidden
        className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700"
      >
        {icon ?? <BuildingIcon />}
      </span>
      <p className="mt-3 text-[15.5px] font-bold">{title}</p>
      <p className="mx-auto mt-1 max-w-[30ch] text-[13.5px] leading-relaxed text-muted">
        {body}
      </p>
      {action && <div className="mx-auto mt-4 max-w-xs">{action}</div>}
    </div>
  );
}

export function OwnerInfoRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3.5">
      <span
        aria-hidden
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"
      >
        {icon ?? <UserIcon />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] text-muted">{label}</span>
        <span className="block truncate text-[14.5px] font-semibold">
          {value}
        </span>
      </span>
    </div>
  );
}

/* ---------- Inline icons (no emoji, no external set) ---------- */

export function BuildingIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="4.5"
        y="7"
        width="15"
        height="13"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M9 20v-4.5h6V20M9 10.5h.01M12 10.5h.01M15 10.5h.01M9 13.5h.01M12 13.5h.01M15 13.5h.01"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M3 7l9-3.5L21 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function UserIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="3.6" stroke="currentColor" strokeWidth="2" />
      <path
        d="M5 19.5c1.2-3.2 3.9-5 7-5s5.8 1.8 7 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MailIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="3.5"
        y="5.5"
        width="17"
        height="13"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="m4.5 7.5 7.5 5.5 7.5-5.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PhoneIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6.5 4h3l1.5 4.5-2 1.5a12 12 0 0 0 5 5l1.5-2L20 14.5v3a1.5 1.5 0 0 1-1.7 1.5C11 18.5 5.5 13 5 5.7A1.5 1.5 0 0 1 6.5 4Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ShieldIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3.5 5 6v6c0 4.2 2.9 7.1 7 8.5 4.1-1.4 7-4.3 7-8.5V6l-7-2.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="m9.5 11.5 1.8 1.8 3.2-3.6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function InboxIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 13.5 6.5 5h11L20 13.5v4a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-4Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M4 13.5h5l1 2h4l1-2h5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CalendarIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="4"
        y="5.5"
        width="16"
        height="14.5"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M4 10h16M8.5 3.5v4M15.5 3.5v4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ---------- Owner navigation: dashboard tabs are NOT routes; only 2 exist ---------- */

const OWNER_TABS = [
  { href: "/owner/dashboard", label: "Studio" },
  { href: "/owner/account", label: "Account" },
] as const;

export function OwnerBottomNav() {
  const path = usePathname();
  return (
    <nav
      aria-label="Owner"
      className="sticky bottom-0 z-20 border-t border-line bg-white/95 backdrop-blur lg:hidden"
    >
      <div className="grid grid-cols-2 px-2 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-1.5">
        {OWNER_TABS.map((t) => {
          const active = path === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-medium transition active:scale-95 ${
                active ? "text-brand-700" : "text-muted"
              }`}
            >
              <span aria-hidden>
                {t.label === "Studio" ? <BuildingIcon /> : <UserIcon />}
              </span>
              {t.label}
              {active && (
                <span className="h-1 w-1 rounded-full bg-brand-600" aria-hidden />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function OwnerDesktopHeader({ name }: { name: string }) {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-30 hidden border-b border-line bg-white/95 backdrop-blur lg:block">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-8 px-8">
        <Link href="/owner/dashboard" className="flex items-center gap-2">
          <span
            aria-hidden
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-700 text-white"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 11.5 12 4l8 7.5"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M6.5 10.5V19a1 1 0 0 0 1 1H17a1 1 0 0 0 1-1v-8.5"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="text-[18px] font-bold tracking-tight">
            Apun-Ghar <span className="font-semibold text-muted">· Owner Studio</span>
          </span>
        </Link>
        <nav aria-label="Owner" className="flex items-center gap-1">
          {OWNER_TABS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={path === l.href ? "page" : undefined}
              className={`rounded-full px-4 py-2 text-[14.5px] font-semibold transition ${
                path === l.href
                  ? "bg-brand-50 text-brand-800"
                  : "text-muted hover:text-ink"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/owner/account"
          className="ml-auto flex min-h-[44px] items-center gap-2.5"
        >
          <span className="hidden text-right xl:block">
            <span className="block text-[13.5px] font-bold leading-tight">
              {name || "Owner"}
            </span>
            <span className="block text-[12px] text-muted">Owner account</span>
          </span>
          <span
            aria-hidden
            className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-700 text-[15px] font-bold text-white"
          >
            {(name || "O").charAt(0).toUpperCase()}
          </span>
        </Link>
      </div>
    </header>
  );
}

/** Deep-teal identity band: management-product header, never renter greeting. */
export function OwnerIdentityBand({
  name,
  accountHref,
}: {
  name: string;
  accountHref?: string;
}) {
  return (
    <div className="bg-brand-800 text-white">
      <div className="mx-auto w-full max-w-6xl px-5 pb-6 pt-6 lg:px-8 lg:pt-8">
        <div className="flex items-center gap-3.5">
          <span
            aria-hidden
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-[24px] font-bold"
          >
            {(name || "O").charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="text-[12px] font-bold uppercase tracking-widest text-white/60">
              Owner Studio
            </p>
            <h1 className="truncate text-[20px] font-bold lg:text-[24px]">
              {name || "Owner"}
            </h1>
            <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[12px] font-semibold text-white/90">
              <span aria-hidden className="inline-flex">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <rect
                    x="4.5"
                    y="7"
                    width="15"
                    height="13"
                    rx="1.5"
                    stroke="currentColor"
                    strokeWidth="2.4"
                  />
                  <path
                    d="M3 7l9-3.5L21 7"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              Owner account
            </p>
          </div>
          {accountHref && (
            <Link
              href={accountHref}
              className="ml-auto hidden min-h-[44px] shrink-0 items-center rounded-xl bg-white px-5 text-[14px] font-bold text-brand-800 transition active:scale-[0.98] lg:inline-flex"
            >
              Account
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
