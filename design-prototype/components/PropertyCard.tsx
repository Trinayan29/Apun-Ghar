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
    <div className="overflow-hidden rounded-2xl border border-line bg-white">
      <div className="relative">
        <Link href={`/property/${p.id}`}>
          <PropImage src={p.images[0]} alt={p.name} className="aspect-[16/10] w-full" />
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
      <Link href={`/property/${p.id}`} className="block p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-[15.5px] font-bold leading-snug text-ink">{p.name}</h3>
            <p className="mt-0.5 text-[13px] text-muted">
              {p.locality}, {p.city} · {p.gender}
            </p>
          </div>
          <Rating value={p.rating} reviews={p.reviews} />
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[13px] font-medium text-brand-700">
          <Icon name="pin" size={15} />
          {p.distanceKm} km from {p.anchor} · {p.roomType}
        </p>
        <div className="mt-3 border-t border-line pt-3">
          <p className="text-[12px] text-muted">{inr(p.rent)} rent</p>
          <p className="text-[16px] font-bold text-ink">
            {inr(totalMonthly(p))} <span className="text-[12px] font-medium text-muted">total/month</span>
          </p>
        </div>
      </Link>
    </div>
  );
}
