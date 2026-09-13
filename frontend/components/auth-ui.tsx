"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/** Shared auth-page shell: brand panel + form column. Mobile-first, intentional on desktop. */
export function AuthShell({
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
    <main className="flex min-h-dvh flex-col bg-paper lg:grid lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-brand-800 p-10 text-white lg:flex">
        <Link href="/" className="text-[19px] font-bold tracking-tight">
          Apun-Ghar
        </Link>
        <div>
          <p className="max-w-sm text-[26px] font-bold leading-snug">
            Find a place that feels right.
          </p>
          <p className="mt-2 max-w-sm text-[14.5px] leading-relaxed text-white/75">
            Verified places. Clear prices. Better decisions — near your college
            or workplace.
          </p>
        </div>
        <p className="text-[12.5px] text-white/60">
          PGs, rooms and homes for students and young professionals.
        </p>
      </div>

      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col px-6 pb-8 pt-10 lg:justify-center lg:py-12">
        <Link href="/" className="text-[18px] font-bold tracking-tight lg:hidden">
          Apun-Ghar
        </Link>
        <h1 className="mt-6 text-[24px] font-bold tracking-tight lg:mt-0">{title}</h1>
        <p className="mt-1 text-[14px] text-muted">{subtitle}</p>
        <div className="mt-6">{children}</div>
        <div className="mt-auto pt-8 text-center text-[14px] text-muted lg:mt-6">
          {footer}
        </div>
      </div>
    </main>
  );
}

export function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-semibold">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-[13px] text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextField({
  id,
  type,
  autoComplete,
  placeholder,
  value,
  onChange,
  disabled,
  error,
}: {
  id: string;
  type: string;
  autoComplete: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  error?: string;
}) {
  return (
    <input
      id={id}
      type={type}
      autoComplete={autoComplete}
      placeholder={placeholder}
      value={value}
      disabled={disabled}
      aria-invalid={Boolean(error)}
      aria-describedby={error ? `${id}-error` : undefined}
      onChange={(e) => onChange(e.target.value)}
      className="h-12 w-full rounded-xl border border-line bg-white px-4 text-[15px] placeholder:text-muted disabled:opacity-60"
    />
  );
}

export function SubmitButton({
  loading,
  label,
  loadingLabel,
}: {
  loading: boolean;
  label: string;
  loadingLabel: string;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="h-12 w-full rounded-xl bg-brand-600 px-8 text-[15.5px] font-bold text-white transition enabled:active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
    >
      {loading ? loadingLabel : label}
    </button>
  );
}

export function GoogleButton({
  onClick,
  disabled,
  label,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-line bg-white px-8 text-[15px] font-semibold transition enabled:active:scale-[0.98] disabled:opacity-60"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
        <path
          fill="#4285F4"
          d="M22.6 12.3c0-.8-.1-1.5-.2-2.3H12v4.5h6c-.3 1.4-1.1 2.5-2.4 3.3v2.8h3.9c2.3-2.1 3.1-5 3.1-8.3Z"
        />
        <path
          fill="#34A853"
          d="M12 23c3.1 0 5.7-1 7.6-2.8l-3.9-2.8c-1 .7-2.4 1.1-3.7 1.1-2.9 0-5.3-1.9-6.1-4.5H1.8v2.9C3.7 20.5 7.5 23 12 23Z"
        />
        <path
          fill="#FBBC05"
          d="M5.9 14c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3V6.5H1.8C1.3 7.6 1 8.8 1 10s.3 2.4.8 3.5l4.1-2.7v3.2Z"
        />
        <path
          fill="#EA4335"
          d="M12 5.4c1.7 0 3.2.6 4.4 1.7l3.4-3.4C17.7 1.9 15.1 1 12 1 7.5 1 3.7 3.5 1.8 6.5l4.1 2.9c.8-2.4 3.2-4 6.1-4Z"
        />
      </svg>
      {label}
    </button>
  );
}

export function FormError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-xl bg-red-50 px-3.5 py-3 text-[13.5px] font-medium text-red-700"
    >
      {message}
    </p>
  );
}
