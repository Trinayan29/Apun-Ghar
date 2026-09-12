"use client";

import React from "react";
import Icon from "./Icon";

/* ---------- Buttons ---------- */
export function PrimaryButton({
  children,
  onClick,
  disabled = false,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`min-h-[52px] w-full rounded-2xl bg-brand-600 text-[16px] font-semibold text-white transition active:scale-[0.98] active:bg-brand-700 disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`min-h-[52px] w-full rounded-2xl border border-line bg-white text-[16px] font-semibold text-ink transition active:scale-[0.98] active:bg-cream ${className}`}
    >
      {children}
    </button>
  );
}

/* ---------- Inputs ---------- */
export function TextInput({
  label,
  placeholder,
  type = "text",
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  type?: string;
  value?: string;
  onChange?: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-ink">{label}</span>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        className="min-h-[52px] w-full rounded-xl border border-line bg-white px-4 text-[15px] text-ink placeholder:text-muted focus:border-brand-600 focus:outline-none"
      />
    </label>
  );
}

/* ---------- Chips ---------- */
export function FilterChip({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full border px-4 text-[13.5px] font-medium transition active:scale-95 ${
        active ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-white text-ink"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

/* ---------- Badges ---------- */
export function VerificationBadge({ verified }: { verified: boolean }) {
  if (!verified)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-cream px-2.5 py-1 text-[11.5px] font-semibold text-muted">
        <Icon name="eye" size={13} /> Unverified
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-[11.5px] font-semibold text-brand-700">
      <Icon name="shield" size={13} /> Verified
    </span>
  );
}

export function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-cream px-2.5 py-1 text-[11.5px] font-medium text-ink">
      {children}
    </span>
  );
}

/* ---------- Section titles ---------- */
export function SectionTitle({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-[16px] font-bold text-ink">{title}</h2>
      {action}
    </div>
  );
}

/* ---------- Property image with graceful fallback ---------- */
export function PropImage({
  src,
  alt,
  className = "",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = React.useState(false);
  if (failed)
    return (
      <div className={`flex items-center justify-center bg-cream ${className}`}>
        <Icon name="bed" size={36} className="text-line" />
      </div>
    );
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`bg-cream object-cover ${className}`}
    />
  );
}

/* ---------- Star rating ---------- */
export function Rating({ value, reviews }: { value: number; reviews: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-ink">
      <Icon name="star" size={14} className="text-accent-500" filled />
      {value.toFixed(1)}
      <span className="font-normal text-muted">({reviews})</span>
    </span>
  );
}
