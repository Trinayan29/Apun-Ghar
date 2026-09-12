"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useMemo, useState } from "react";
import { useApp } from "@/store/AppStore";
import { PROPERTIES } from "@/data/properties";
import Icon from "@/components/Icon";
import { PrimaryButton, PropImage } from "@/components/ui";

const TIMES = ["10:00 AM", "11:30 AM", "1:00 PM", "3:00 PM", "4:30 PM", "6:00 PM"];

function nextDays(n: number) {
  const out: { label: string; sub: string }[] = [];
  const now = new Date();
  for (let i = 1; i <= n; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    out.push({
      label: d.toLocaleDateString("en-IN", { weekday: "short" }),
      sub: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    });
  }
  return out;
}

export default function ScheduleVisit({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { addVisit } = useApp();
  const p = PROPERTIES.find((x) => x.id === id);
  const days = useMemo(() => nextDays(7), []);
  const [day, setDay] = useState(1);
  const [time, setTime] = useState("4:30 PM");
  const [done, setDone] = useState(false);

  if (!p) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <Link href="/search" className="font-semibold text-brand-700">Back to search</Link>
      </main>
    );
  }

  const dateLabel = `${days[day].label}, ${days[day].sub}`;

  const confirm = () => {
    addVisit({ propertyId: p.id, date: dateLabel, time });
    setDone(true);
  };

  if (done) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center px-8 pb-10 pt-20 text-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-600 text-white">
          <Icon name="check" size={36} />
        </span>
        <h1 className="mt-6 text-[24px] font-bold tracking-tight">Visit scheduled</h1>
        <p className="mt-2 text-[15px] text-muted">
          {dateLabel} · {time}
        </p>
        <div className="mt-6 flex w-full items-center gap-3 rounded-2xl border border-line bg-white p-3 text-left">
          <PropImage src={p.images[0]} alt={p.name} className="h-16 w-16 rounded-xl" />
          <div>
            <p className="text-[15px] font-bold">{p.name}</p>
            <p className="text-[13px] text-muted">{p.locality}, {p.city}</p>
          </div>
        </div>
        <p className="mt-4 text-[13.5px] leading-relaxed text-muted">
          The owner has been notified. We&apos;ll remind you an hour before your visit.
        </p>
        <div className="mt-auto w-full space-y-3 pt-8">
          <PrimaryButton onClick={() => router.push("/visits")}>View my visits</PrimaryButton>
          <button onClick={() => router.push("/home")} className="w-full py-2 text-[14.5px] font-semibold text-brand-700">
            Back to home
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col">
      <div className="flex items-center gap-3 border-b border-line px-5 py-4">
        <button onClick={() => router.back()} aria-label="Back" className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-white">
          <Icon name="back" size={19} />
        </button>
        <h1 className="text-[17px] font-bold">Schedule a visit</h1>
      </div>

      <div className="mx-auto w-full max-w-2xl flex-1 px-5 py-4 lg:px-8">
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3">
          <PropImage src={p.images[0]} alt={p.name} className="h-16 w-16 rounded-xl" />
          <div>
            <p className="text-[15px] font-bold">{p.name}</p>
            <p className="text-[13px] text-muted">{p.locality} · {p.distanceKm} km from {p.anchor}</p>
          </div>
        </div>

        <h2 className="mb-2.5 mt-6 text-[15px] font-bold">Select a date</h2>
        <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 lg:mx-0 lg:px-0">
          {days.map((d, i) => (
            <button
              key={d.sub}
              onClick={() => setDay(i)}
              className={`flex min-h-[68px] w-[64px] shrink-0 flex-col items-center justify-center rounded-2xl border transition active:scale-95 ${
                day === i ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-white text-ink"
              }`}
            >
              <span className="text-[12px] font-medium opacity-80">{d.label}</span>
              <span className="text-[14.5px] font-bold">{d.sub}</span>
            </button>
          ))}
        </div>

        <h2 className="mb-2.5 mt-6 text-[15px] font-bold">Available times</h2>
        <div className="grid grid-cols-3 gap-2.5">
          {TIMES.map((t) => (
            <button
              key={t}
              onClick={() => setTime(t)}
              className={`min-h-[48px] rounded-xl border text-[13.5px] font-semibold transition active:scale-95 ${
                time === t ? "border-brand-700 bg-brand-50 text-brand-800" : "border-line bg-white text-ink"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-auto border-t border-line bg-white px-5 py-4">
        <div className="mx-auto w-full max-w-2xl lg:px-3">
          <PrimaryButton onClick={confirm}>Confirm visit · {dateLabel}, {time}</PrimaryButton>
        </div>
      </div>
    </main>
  );
}
