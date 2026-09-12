"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/store/AppStore";
import Icon from "@/components/Icon";
import BottomNav from "@/components/BottomNav";
import DesktopHeader from "@/components/DesktopHeader";

function Row({
  icon,
  label,
  value,
  href,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  value: string;
  href?: string;
}) {
  const inner = (
    <>
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cream text-brand-700">
        <Icon name={icon} size={19} />
      </span>
      <span className="flex-1">
        <span className="block text-[13px] text-muted">{label}</span>
        <span className="block text-[14.5px] font-semibold text-ink">{value}</span>
      </span>
      {href && <Icon name="chevR" size={18} className="text-muted" />}
    </>
  );
  return href ? (
    <Link href={href} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3 transition active:scale-[0.99]">
      {inner}
    </Link>
  ) : (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3">{inner}</div>
  );
}

export default function Profile() {
  const router = useRouter();
  const { userName, anchor, savedIds, visits, onboarding } = useApp();
  const upcoming = visits.filter((v) => v.status === "upcoming").length;

  return (
    <main className="flex min-h-dvh flex-col">
      <DesktopHeader />
      <div className="bg-brand-800 text-white">
        <div className="mx-auto w-full max-w-3xl px-5 pb-6 pt-8">
        <div className="flex items-center gap-3.5">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/15 text-[24px] font-bold">
            {userName.charAt(0).toUpperCase()}
          </span>
          <div>
            <h1 className="text-[20px] font-bold">{userName}</h1>
            <p className="text-[13.5px] text-white/75">Student · Guwahati</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <Link href="/saved" className="rounded-2xl bg-white/12 px-4 py-3">
            <p className="text-[19px] font-bold">{savedIds.length}</p>
            <p className="text-[12.5px] text-white/80">Saved places</p>
          </Link>
          <Link href="/visits" className="rounded-2xl bg-white/12 px-4 py-3">
            <p className="text-[19px] font-bold">{upcoming}</p>
            <p className="text-[12.5px] text-white/80">Upcoming visits</p>
          </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl flex-1 space-y-2.5 px-5 py-4">
        <p className="px-1 text-[13px] font-bold uppercase tracking-wide text-muted">Preferences</p>
        <Row icon="grad" label="College / workplace" value={anchor} />
        <Row icon="bed" label="Looking for" value={onboarding.roomType || "Not set yet"} />
        <Row
          icon="clock"
          label="Budget"
          value={onboarding.budget ? `Under ₹${(onboarding.budget / 1000).toFixed(0)}k / month` : "Not set yet"}
        />
        <Row icon="calendar" label="Moving" value={onboarding.moveIn || "Flexible"} />

        <p className="px-1 pt-2 text-[13px] font-bold uppercase tracking-wide text-muted">Account</p>
        <Row icon="gear" label="Settings" value="Notifications, privacy" />
        <button
          onClick={() => router.push("/")}
          className="flex w-full items-center gap-3 rounded-2xl border border-line bg-white p-3 text-left transition active:scale-[0.99]"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600">
            <Icon name="logout" size={19} />
          </span>
          <span className="text-[14.5px] font-semibold text-red-600">Log out</span>
        </button>
        <p className="pt-2 text-center text-[12px] text-muted">Apun-Ghar prototype · fictional demo data</p>
      </div>

      <BottomNav />
    </main>
  );
}
