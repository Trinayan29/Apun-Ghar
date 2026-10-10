"use client";

import Link from "next/link";
import { useApp } from "@/store/AppStore";
import { inr, totalMonthly, type Property } from "@/data/properties";
import Icon from "./Icon";
import { PropImage, Rating, VerificationBadge } from "./ui";

export default function PropertyCard({ p }: { p: Property }) {
  const { savedIds, toggleSaved } = useApp();
  const saved = savedIds.includes(p.id);
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white">
      <div className="relative">
        <Link href={`/property/${p.id}`}>
          <PropImage src={p.images[0]} alt={p.name} className="aspect-[4/3] w-full" />
        </Link>
        <button
          aria-label={saved ? "Unsave" : "Save"}
          onClick={() => toggleSaved(p.id)}
          className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 shadow-sm transition active:scale-90"
        >
          <Icon
            name="heart"
            size={20}
            filled={saved}
            className={saved ? "text-red-500" : "text-ink"}
          />
        </button>
        <div className="absolute left-3 top-3">
          <VerificationBadge verified={p.verified} />
        </div>
      </div>
      <Link href={`/property/${p.id}`} className="block p-3.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[15.5px] font-bold leading-snug tracking-tight text-ink">{p.name}</h3>
          <Rating value={p.rating} reviews={p.reviews} />
        </div>
        <p className="mt-1 text-[16px] font-extrabold tracking-tight text-ink">
          {inr(totalMonthly(p))} <span className="text-[12.5px] font-semibold text-muted">/ month</span>
        </p>
        <p className="mt-1 text-[13px] text-muted">
          {p.roomType} · {p.gender}
        </p>
        <p className="mt-1.5 flex items-center gap-1.5 border-t border-line pt-2.5 text-[13px] font-medium text-brand-700">
          <Icon name="pin" size={15} />
          {p.locality}, {p.city} · {p.distanceKm} km from {p.anchor}
        </p>
      </Link>
    </div>
  );
}
