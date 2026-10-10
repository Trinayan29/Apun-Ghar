"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/store/AppStore";
import Icon from "@/components/Icon";
import {
  OwnerBottomNav,
  OwnerDesktopHeader,
  OwnerSectionLabel,
} from "@/components/owner-ui";

function Row({
  icon,
  label,
  value,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[#E3E8EF] bg-white p-3.5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EAF3FF] text-[#1677E8]">
        <Icon name={icon} size={19} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] text-[#5B6B7C]">{label}</span>
        <span className="block truncate text-[14.5px] font-semibold text-ink">{value}</span>
      </span>
    </div>
  );
}

export default function OwnerAccount() {
  const router = useRouter();
  const { owner, setOwner } = useApp();
  const name = owner?.name ?? "Owner";
  const email = owner?.email ?? "Not available";
  const phone = owner?.phone ?? "Not available";

  const signOut = () => {
    setOwner(null);
    router.push("/list-your-property");
  };

  return (
    <main className="flex min-h-dvh flex-col bg-paper text-ink">
      <OwnerDesktopHeader name={name} />

      <div className="bg-[#0F5BB5] text-white">
        <div className="mx-auto w-full max-w-3xl px-5 pb-6 pt-8">
          <div className="flex items-center gap-3.5">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 text-[24px] font-bold">
              {name.charAt(0).toUpperCase()}
            </span>
            <div>
              <h1 className="text-[20px] font-bold">{name}</h1>
              <p className="mt-0.5 inline-flex items-center gap-1.5 rounded-full bg-white/12 px-2.5 py-1 text-[12px] font-semibold text-white/90">
                <Icon name="building" size={13} /> Owner account
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl flex-1 space-y-2.5 px-5 py-5">
        <OwnerSectionLabel>Profile</OwnerSectionLabel>
        <Row icon="user" label="Full name" value={name} />
        <Row icon="chat" label="Email" value={email} />
        <Row icon="phone" label="Phone" value={phone} />
        <div className="flex items-center gap-3 rounded-2xl border border-[#E3E8EF] bg-white p-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EAF3FF] text-[#1677E8]">
            <Icon name="shield" size={19} />
          </span>
          <span className="flex-1">
            <span className="block text-[13px] text-[#5B6B7C]">Account type</span>
            <span className="block text-[14.5px] font-semibold text-ink">Property owner</span>
          </span>
        </div>

        <div className="px-1 pt-3">
          <OwnerSectionLabel>Support</OwnerSectionLabel>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-[#E3E8EF] bg-white p-3.5 opacity-80">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EAF3FF] text-[#1677E8]">
            <Icon name="chat" size={19} />
          </span>
          <span className="flex-1">
            <span className="block text-[14.5px] font-semibold text-ink">Help & contact</span>
            <span className="block text-[13px] text-[#5B6B7C]">Owner support is coming soon</span>
          </span>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-[#E3E8EF] bg-white p-3.5 opacity-80">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EAF3FF] text-[#1677E8]">
            <Icon name="eye" size={19} />
          </span>
          <span className="flex-1">
            <span className="block text-[14.5px] font-semibold text-ink">How tenants see you</span>
            <span className="block text-[13px] text-[#5B6B7C]">Public owner profile preview — coming soon</span>
          </span>
        </div>

        <div className="space-y-2.5 pt-3">
          <Link
            href="/owner/dashboard"
            className="flex min-h-[52px] items-center justify-center rounded-2xl bg-[#1677E8] text-[16px] font-bold text-white transition active:scale-[0.98]"
          >
            Back to Owner Studio
          </Link>
          <button
            onClick={signOut}
            className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border border-[#E3E8EF] bg-white text-[15.5px] font-semibold text-red-600 transition active:scale-[0.99]"
          >
            <Icon name="logout" size={19} /> Sign out
          </button>
        </div>
        <p className="pt-2 text-center text-[12px] text-[#5B6B7C]">Apun-Ghar prototype · fictional demo data</p>
      </div>

      <OwnerBottomNav />
    </main>
  );
}
