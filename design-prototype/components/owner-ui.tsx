"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "./Icon";

/* ---------- Owner brand row (same mark as renter, owner context label) ---------- */
export function OwnerBrand({ backHref = "/" }: { backHref?: string }) {
  return (
    <div className="flex items-center justify-between">
      <Link href={backHref} className="flex items-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1677E8] text-white">
          <Icon name="home" size={22} />
        </span>
        <span>
          <span className="block text-[19px] font-bold leading-none tracking-tight">Apun-Ghar</span>
          <span className="mt-0.5 block text-[11.5px] font-bold uppercase tracking-widest text-[#1677E8]">
            For owners
          </span>
        </span>
      </Link>
    </div>
  );
}

/* ---------- Form field with inline error + optional trailing slot ---------- */
export function OwnerField({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-semibold text-ink">
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1.5 text-[12.5px] text-[#5B6B7C]">{hint}</p>}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-[13px] font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function OwnerInput({
  id,
  type = "text",
  autoComplete,
  placeholder,
  value,
  onChange,
  error,
  trailing,
  min,
  max,
}: {
  id: string;
  type?: string;
  autoComplete?: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  trailing?: React.ReactNode;
  min?: string;
  max?: string;
}) {
  return (
    <div className="relative">
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        min={min}
        max={max}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={`min-h-[52px] w-full rounded-xl border bg-white px-4 text-[15px] text-ink placeholder:text-[#5B6B7C] focus:outline-none ${
          trailing ? "pr-12" : ""
        } ${error ? "border-red-400 focus:border-red-500" : "border-[#E3E8EF] focus:border-[#1677E8]"}`}
      />
      {trailing && (
        <span className="absolute inset-y-0 right-1 flex items-center">{trailing}</span>
      )}
    </div>
  );
}

export function PasswordToggle({
  visible,
  onToggle,
  label,
}: {
  visible: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-pressed={visible}
      className="flex h-11 w-11 items-center justify-center rounded-lg text-[#5B6B7C] transition active:scale-95"
    >
      <Icon name={visible ? "eyeOff" : "eye"} size={20} />
    </button>
  );
}

/* ---------- Account-type conflict: renter account on an owner screen ---------- */
export function OwnerConflictNotice({
  email,
  onSignOut,
}: {
  email: string;
  onSignOut: () => void;
}) {
  return (
    <div role="alert" className="rounded-2xl border border-[#E3E8EF] bg-white p-5">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#EAF3FF] text-[#1677E8]">
        <Icon name="user" size={22} />
      </span>
      <h2 className="mt-3 text-[17px] font-bold tracking-tight">
        This sign-in is already registered as a renter account.
      </h2>
      <p className="mt-1.5 text-[14px] leading-relaxed text-[#5B6B7C]">
        {email ? (
          <>
            <span className="font-semibold text-ink">{email}</span> is used for finding a place.{" "}
          </>
        ) : null}
        Renter and owner accounts are separate — one sign-in can&apos;t do both. To manage
        properties, use a different email for your owner account.
      </p>
      <div className="mt-4 space-y-2.5">
        <Link
          href="/login"
          className="flex min-h-[48px] items-center justify-center rounded-xl bg-[#1677E8] px-5 text-[15px] font-bold text-white transition active:scale-[0.98]"
        >
          Go to renter sign-in
        </Link>
        <button
          type="button"
          onClick={onSignOut}
          className="flex min-h-[48px] w-full items-center justify-center rounded-xl border border-[#E3E8EF] bg-white px-5 text-[15px] font-semibold text-ink transition active:scale-[0.98]"
        >
          Sign out and try another email
        </button>
      </div>
    </div>
  );
}

/* ---------- Dashboard atoms ---------- */
export function OwnerSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-1 text-[12.5px] font-bold uppercase tracking-widest text-[#5B6B7C]">{children}</p>
  );
}

export function OwnerStatCard({
  icon,
  value,
  label,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-2xl border border-[#E3E8EF] bg-white p-4">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EAF3FF] text-[#1677E8]">
        <Icon name={icon} size={19} />
      </span>
      <p className="mt-2.5 text-[22px] font-bold leading-none">{value}</p>
      <p className="mt-1 text-[12.5px] font-medium text-[#5B6B7C]">{label}</p>
    </div>
  );
}

export function OwnerEmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[#E3E8EF] bg-white/60 px-5 py-8 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EAF3FF] text-[#1677E8]">
        <Icon name={icon} size={24} />
      </span>
      <p className="mt-3 text-[15.5px] font-bold">{title}</p>
      <p className="mx-auto mt-1 max-w-[26ch] text-[13.5px] leading-relaxed text-[#5B6B7C]">{body}</p>
      {action && <div className="mx-auto mt-4 max-w-xs">{action}</div>}
    </div>
  );
}

export function ComingSoonPill() {
  return (
    <span className="inline-flex items-center rounded-full bg-[#EAF3FF] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[#5B6B7C]">
      Coming soon
    </span>
  );
}

/* ---------- Owner bottom nav: dashboard tabs are in-page; only 2 real routes ---------- */
const OWNER_TABS = [
  { href: "/owner/dashboard", label: "Studio", icon: "home" },
  { href: "/owner/account", label: "Account", icon: "user" },
] as const;

export function OwnerBottomNav() {
  const path = usePathname();
  return (
    <nav className="sticky bottom-0 z-20 border-t border-[#E3E8EF] bg-white/95 backdrop-blur lg:hidden">
      <div className="grid grid-cols-2 px-2 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-1.5">
        {OWNER_TABS.map((t) => {
          const active = path === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-medium transition active:scale-95 ${
                active ? "text-[#1677E8]" : "text-[#5B6B7C]"
              }`}
            >
              <Icon name={t.icon} size={23} />
              {t.label}
              {active && <span className="h-1 w-1 rounded-full bg-[#1677E8]" />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/* ---------- Owner desktop header ---------- */
export function OwnerDesktopHeader({ name }: { name: string }) {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-30 hidden border-b border-[#E3E8EF] bg-white/95 backdrop-blur lg:block">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-8 px-8">
        <Link href="/owner/dashboard" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1677E8] text-white">
            <Icon name="home" size={20} />
          </span>
          <span className="text-[18px] font-bold tracking-tight">
            Apun-Ghar <span className="font-semibold text-[#5B6B7C]">· Owner Studio</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1">
          {[
            { href: "/owner/dashboard", label: "Studio" },
            { href: "/owner/account", label: "Account" },
          ].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-full px-4 py-2 text-[14.5px] font-semibold transition ${
                path === l.href ? "bg-[#EAF3FF] text-[#0F5BB5]" : "text-[#5B6B7C] hover:text-[#17202A]"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <Link href="/owner/account" className="ml-auto flex items-center gap-2.5">
          <span className="hidden text-right xl:block">
            <span className="block text-[13.5px] font-bold leading-tight">{name || "Owner"}</span>
            <span className="block text-[12px] text-[#5B6B7C]">Owner account</span>
          </span>
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1677E8] text-[15px] font-bold text-white">
            {(name || "O").charAt(0).toUpperCase()}
          </span>
        </Link>
      </div>
    </header>
  );
}
