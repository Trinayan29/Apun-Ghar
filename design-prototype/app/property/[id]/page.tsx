"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { useApp } from "@/store/AppStore";
import { PROPERTIES } from "@/data/properties";
import Icon from "@/components/Icon";
import DesktopHeader from "@/components/DesktopHeader";
import PriceBreakdown from "@/components/PriceBreakdown";
import { PropImage, Rating, Tag, VerificationBadge } from "@/components/ui";

const MODE_ICON: Record<string, "bike" | "walk" | "bus" | "cycle"> = {
  bike: "bike",
  walk: "walk",
  bus: "bus",
  cycle: "cycle",
};

export default function PropertyDetails({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { savedIds, toggleSaved } = useApp();
  const [photo, setPhoto] = useState(0);
  const [reported, setReported] = useState(false);
  const p = PROPERTIES.find((x) => x.id === id);

  if (!p) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center px-8 text-center">
        <p className="text-[17px] font-bold">This place is no longer listed.</p>
        <Link href="/search" className="mt-4 font-semibold text-brand-700">Back to search</Link>
      </main>
    );
  }

  const saved = savedIds.includes(p.id);

  return (
    <main className="flex min-h-dvh flex-col pb-28 lg:pb-10">
      <DesktopHeader />
      <div className="mx-auto w-full max-w-7xl px-0 sm:px-5 lg:px-8">
        <button
          onClick={() => router.back()}
          className="mx-5 mt-4 hidden items-center gap-1 text-[14px] font-semibold text-muted hover:text-ink lg:inline-flex"
        >
          <Icon name="back" size={17} /> Back to results
        </button>

        <div className="grid gap-6 lg:mt-3 lg:grid-cols-[1.25fr_1fr]">
          {/* Gallery */}
          <div>
            <div className="relative">
              <PropImage src={p.images[photo]} alt={p.name} className="aspect-[4/3] w-full sm:rounded-2xl" />
              <div className="absolute left-4 top-4 lg:hidden">
                <button onClick={() => router.back()} aria-label="Back" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/95 shadow-sm">
                  <Icon name="back" size={19} />
                </button>
              </div>
              <div className="absolute right-4 top-4 lg:hidden">
                <button onClick={() => toggleSaved(p.id)} aria-label="Save" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/95 shadow-sm transition active:scale-90">
                  <Icon name="heart" size={20} filled={saved} className={saved ? "text-red-500" : "text-ink"} />
                </button>
              </div>
              <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
                {p.images.map((_, i) => (
                  <button key={i} onClick={() => setPhoto(i)} aria-label={`Photo ${i + 1}`}
                    className={`h-1.5 rounded-full transition ${i === photo ? "w-6 bg-white" : "w-1.5 bg-white/60"}`} />
                ))}
              </div>
            </div>
            <div className="no-scrollbar mt-3 hidden gap-2 overflow-x-auto px-5 sm:flex lg:px-0">
              {p.images.map((src, i) => (
                <button key={i} onClick={() => setPhoto(i)}
                  className={`overflow-hidden rounded-xl border-2 ${i === photo ? "border-brand-600" : "border-transparent"}`}>
                  <PropImage src={src} alt={`${p.name} photo ${i + 1}`} className="h-16 w-24" />
                </button>
              ))}
            </div>
            {/* Mobile thumbnails */}
            <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 pt-3 sm:hidden">
              {p.images.map((src, i) => (
                <button key={i} onClick={() => setPhoto(i)}
                  className={`overflow-hidden rounded-xl border-2 ${i === photo ? "border-brand-600" : "border-transparent"}`}>
                  <PropImage src={src} alt={`${p.name} photo ${i + 1}`} className="h-14 w-20" />
                </button>
              ))}
            </div>
          </div>

          {/* Key info */}
          <div className="px-5 sm:px-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h1 className="text-[21px] font-bold tracking-tight lg:text-[26px]">{p.name}</h1>
                <p className="mt-0.5 text-[14px] text-muted">{p.locality}, {p.city}</p>
              </div>
              <Rating value={p.rating} reviews={p.reviews} />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <VerificationBadge verified={p.verified} />
              <Tag>{p.roomType}</Tag>
              <Tag>{p.gender}</Tag>
              <Tag>{p.available}</Tag>
              <button
                onClick={() => toggleSaved(p.id)}
                className={`hidden items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] font-semibold transition active:scale-95 lg:inline-flex ${
                  saved ? "border-red-200 bg-red-50 text-red-600" : "border-line bg-white text-ink"
                }`}
              >
                <Icon name="heart" size={16} filled={saved} className={saved ? "text-red-500" : ""} />
                {saved ? "Saved" : "Save"}
              </button>
            </div>

            <div className="mt-4 flex items-center gap-3 rounded-2xl bg-brand-50 p-3.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-700 text-white">
                <Icon name={MODE_ICON[p.commuteMode]} size={20} />
              </span>
              <p className="text-[13.5px] font-medium text-brand-800">
                <span className="font-bold">{p.distanceKm} km from {p.anchor}</span>
                <br />~{p.commuteMins} min by {p.commuteMode}
              </p>
            </div>

            <div className="mt-4">
              <PriceBreakdown p={p} />
            </div>

            <div className="mt-4 hidden gap-2.5 lg:flex">
              <Link
                href={`/visit/${p.id}`}
                className="flex min-h-[52px] flex-[1.4] items-center justify-center rounded-2xl bg-brand-600 text-[15.5px] font-bold text-white transition active:scale-[0.98]"
              >
                Schedule a visit
              </Link>
              <button className="flex min-h-[52px] flex-1 items-center justify-center gap-1.5 rounded-2xl border border-line bg-white text-[14.5px] font-semibold">
                <Icon name="chat" size={19} className="text-brand-700" /> Message
              </button>
            </div>
          </div>
        </div>

        {/* Lower sections */}
        <div className="grid gap-4 px-5 pt-4 sm:px-0 lg:grid-cols-3">
          <div className="rounded-2xl border border-line bg-white p-4">
            <h3 className="text-[15px] font-bold">Amenities</h3>
            <div className="mt-2.5 grid grid-cols-1 gap-2">
              {p.amenities.map((a) => (
                <p key={a} className="flex items-center gap-2.5 text-[14px] text-ink">
                  <Icon name="check" size={16} className="text-brand-600" /> {a}
                </p>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-white p-4">
            <h3 className="text-[15px] font-bold">House rules</h3>
            <ul className="mt-2 space-y-1.5 text-[14px] text-muted">
              {p.rules.map((r) => <li key={r}>· {r}</li>)}
            </ul>
            <h3 className="mt-4 text-[15px] font-bold">Stay details</h3>
            <ul className="mt-2 space-y-1.5 text-[14px] text-muted">
              <li>· {p.furnished}</li>
              <li>· {p.food ? "Food included" : "No food"}</li>
              <li>· {p.attachedBath ? "Attached bath" : "Shared bath"}</li>
            </ul>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-line bg-white p-4">
              <h3 className="text-[15px] font-bold">About this place</h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{p.about}</p>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-cream text-[17px] font-bold text-brand-800">
                {p.owner.name.charAt(0)}
              </span>
              <div className="flex-1">
                <p className="text-[14.5px] font-bold">{p.owner.name} <span className="font-normal text-muted">· Owner</span></p>
                <p className="text-[12.5px] text-muted">Since {p.owner.since} · responds ~{p.owner.responseRate}%</p>
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={() => setReported(true)}
          disabled={reported}
          className="mt-4 w-full text-center text-[13px] font-medium text-muted disabled:opacity-70"
        >
          {reported ? "Thanks — our team will review this listing." : "Report suspicious listing"}
        </button>
      </div>

      {/* Sticky action bar (mobile only — desktop has inline CTAs) */}
      <div className="fixed bottom-0 left-0 z-20 w-full border-t border-line bg-white px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 lg:hidden">
        <div className="flex gap-2.5">
          <button className="flex min-h-[52px] flex-1 items-center justify-center gap-1.5 rounded-2xl border border-line bg-white text-[14.5px] font-semibold">
            <Icon name="chat" size={19} className="text-brand-700" /> Message
          </button>
          <Link
            href={`/visit/${p.id}`}
            className="flex min-h-[52px] flex-[1.4] items-center justify-center rounded-2xl bg-brand-600 text-[15.5px] font-bold text-white transition active:scale-[0.98]"
          >
            Schedule a visit
          </Link>
        </div>
      </div>
    </main>
  );
}
