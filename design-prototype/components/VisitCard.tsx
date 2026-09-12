"use client";

import Link from "next/link";
import { PROPERTIES } from "@/data/properties";
import Icon from "./Icon";
import { PropImage } from "./ui";
import { useApp, type Visit } from "@/store/AppStore";

const STATUS_STYLE: Record<Visit["status"], string> = {
  upcoming: "bg-brand-50 text-brand-700",
  completed: "bg-cream text-muted",
  cancelled: "bg-red-50 text-red-600",
};

export default function VisitCard({ visit }: { visit: Visit }) {
  const { cancelVisit } = useApp();
  const p = PROPERTIES.find((x) => x.id === visit.propertyId);
  if (!p) return null;
  return (
    <div className="flex gap-3 rounded-2xl border border-line bg-white p-3">
      <Link href={`/property/${p.id}`}>
        <PropImage src={p.images[0]} alt={p.name} className="h-20 w-20 rounded-xl" />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-[14.5px] font-bold text-ink">{p.name}</p>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${STATUS_STYLE[visit.status]}`}>
            {visit.status}
          </span>
        </div>
        <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted">
          <Icon name="calendar" size={14} /> {visit.date} · {visit.time}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted">
          <Icon name="pin" size={14} /> {p.locality}, {p.city}
        </p>
        {visit.status === "upcoming" && (
          <button
            onClick={() => cancelVisit(visit.id)}
            className="mt-1.5 text-[13px] font-semibold text-red-600 active:opacity-70"
          >
            Cancel visit
          </button>
        )}
      </div>
    </div>
  );
}
