"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/store/AppStore";
import Icon from "@/components/Icon";
import styles from "./flow.module.css";
import {
  CHAPTERS,
  normalizeDraft,
  type FlowChapter,
  type ListingDraft,
} from "@/components/listing/types";
import { WhatChapter, KindChapter } from "./chapters/WhatKind";
import WhereChapter from "./chapters/Where";
import SpaceChapter from "./chapters/Space";
import { IncludedChapter, WhoChapter } from "./chapters/IncludedRules";
import PhotosChapter from "./chapters/Photos";
import PriceChapter from "./chapters/Price";
import MoveInChapter from "./chapters/MoveIn";
import NameChapter from "./chapters/Name";
import ListingChapter from "./chapters/Listing";

const ORDER: FlowChapter[] = CHAPTERS.map((c) => c.key);

function scrollTo(c: FlowChapter) {
  document.getElementById(`chapter-${c}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function Flow() {
  const router = useRouter();
  const params = useSearchParams();
  const { drafts, createDraft, updateDraft, setDraftStatus } = useApp();

  const draftId = params.get("draft");
  const raw = drafts.find((d) => d.id === draftId) ?? null;

  if (!raw) {
    return (
      <main className={`${styles.flow} flex min-h-dvh flex-col`}>
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-6 py-12">
          <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#1677E8]">
            For property owners
          </p>
          <h1 className={`${styles.display} mt-2 text-[34px] leading-[1.1]`}>
            Put your place on Apun-Ghar
          </h1>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-[#5B6B7C]">
            Tell us a little about the place. We&apos;ll help you turn it into a listing —
            save anytime and finish later.
          </p>
          <div className="mt-7 grid gap-2">
            <button
              type="button"
              onClick={() => {
                const id = createDraft();
                router.push(`/owner/listings/new?draft=${id}`);
              }}
              className="flex min-h-[54px] items-center justify-center rounded-[14px] bg-[#1677E8] text-[16px] font-bold text-white transition active:scale-[0.98]"
            >
              Start listing
            </button>
            <Link
              href="/owner/dashboard"
              className="flex min-h-[52px] items-center justify-center rounded-[14px] border border-[#E3E8EF] bg-white text-[15px] font-bold transition active:scale-[0.98]"
            >
              Back to Studio
            </Link>
          </div>
          <div className="mt-8 space-y-2.5">
            {[
              ["clock", "Takes about 10 minutes — in small steps"],
              ["check", "Your progress saves itself as you go"],
              ["eye", "You preview exactly what renters will see"],
            ].map(([icon, text]) => (
              <p key={text} className="flex items-center gap-2.5 text-[14px] text-[#5B6B7C]">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EAF3FF] text-[#0F5BB5]">
                  <Icon name={icon as "clock"} size={16} />
                </span>
                {text}
              </p>
            ))}
          </div>
        </div>
      </main>
    );
  }

  const draft: ListingDraft = normalizeDraft(raw);
  const save = (patch: Partial<ListingDraft>) => updateDraft(draft.id, patch);
  const doneList = draft.done ?? [];
  const doneCount = ORDER.filter((c) => doneList.includes(c)).length;

  const go = (c: FlowChapter) => {
    updateDraft(draft.id, { chapter: c });
    requestAnimationFrame(() => scrollTo(c));
  };
  const backTo = (c: FlowChapter) => scrollTo(c);
  const prevOf = (c: FlowChapter): FlowChapter => ORDER[Math.max(0, ORDER.indexOf(c) - 1)];

  const markDoneAndGo = (from: FlowChapter, to: FlowChapter) => {
    const done = draft.done ?? [];
    if (!done.includes(from)) save({ done: [...done, from] });
    go(to);
  };
  return (
    <main className={`${styles.flow} flex min-h-dvh flex-col`}>
      {/* Slim progress header — in-flow, never covering content */}
      <header className="sticky top-0 z-30 border-b border-[#E3E8EF] bg-[#F7F9FC]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-5 py-3 lg:px-8">
          <Link
            href="/owner/dashboard"
            aria-label="Back to Studio"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#E3E8EF] bg-white transition active:scale-95"
          >
            <Icon name="back" size={19} />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-bold">
              {draft.basics.title.trim() || "Your new listing"}
            </p>
            <p className="text-[12.5px] text-[#5B6B7C]">{doneCount} of {ORDER.length} sections complete</p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
              draft.status === "published" ? "bg-[#2F7D4F] text-white" : draft.status === "paused" ? "bg-[#E3E8EF] text-[#5B6B7C]" : "bg-[#EAF3FF] text-[#0F5BB5]"
            }`}
          >
            {draft.status}
          </span>
        </div>
        <div className={styles.hairline} style={{ height: 3 }}>
          <div style={{ width: `${(doneCount / ORDER.length) * 100}%` }} />
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-10 px-5 py-8 lg:grid-cols-[200px_1fr] lg:px-8">
        {/* Progress rail — secondary, never a trap */}
        <nav aria-label="Listing progress" className="hidden lg:block">
          <div className="sticky top-28 space-y-0.5">
            {CHAPTERS.map((c) => {
              const done = doneList.includes(c.key);
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => scrollTo(c.key)}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13.5px] font-semibold text-[#5B6B7C] transition hover:bg-[#EAF3FF]"
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                      done ? "bg-[#2F7D4F] text-white" : "bg-[#E3E8EF] text-[#5B6B7C]"
                    }`}
                  >
                    {done ? <Icon name="check" size={11} /> : "·"}
                  </span>
                  {c.label}
                </button>
              );
            })}
            <p className="px-3 pt-3 text-[12px] leading-relaxed text-[#93A1B3]">
              Saved automatically as you go. Leave anytime — your draft waits in the Studio.
            </p>
          </div>
        </nav>

        {/* Chapters */}
        <div className="min-w-0 max-w-2xl space-y-14 pb-10">
          <WhatChapter draft={draft} save={save} go={(c) => { markDoneAndGo("what", c); }} />
          <KindChapter draft={draft} save={save} go={(c) => { markDoneAndGo("kind", c); }} back={() => backTo(prevOf("kind"))} />
          <WhereChapter draft={draft} save={save} go={(c) => { markDoneAndGo("where", c); }} back={() => backTo(prevOf("where"))} />
          <SpaceChapter draft={draft} save={save} go={(c) => { markDoneAndGo("space", c); }} back={() => backTo(prevOf("space"))} />
          <IncludedChapter draft={draft} save={save} go={(c) => { markDoneAndGo("included", c); }} back={() => backTo(prevOf("included"))} />
          <WhoChapter draft={draft} save={save} go={(c) => { markDoneAndGo("who", c); }} back={() => backTo(prevOf("who"))} />
          <PhotosChapter draft={draft} save={save} go={(c) => { markDoneAndGo("photos", c); }} back={() => backTo(prevOf("photos"))} />
          <PriceChapter draft={draft} save={save} go={(c) => { markDoneAndGo("price", c); }} back={() => backTo(prevOf("price"))} />
          <MoveInChapter draft={draft} save={save} go={(c) => { markDoneAndGo("movein", c); }} back={() => backTo(prevOf("movein"))} />
          <NameChapter draft={draft} save={save} go={(c) => { markDoneAndGo("name", c); }} back={() => backTo(prevOf("name"))} />
          <ListingChapter
            draft={draft}
            save={save}
            go={scrollTo}
            back={() => backTo("name")}
            onPublish={() => setDraftStatus(draft.id, "published")}
            onPause={() => setDraftStatus(draft.id, "paused")}
          />
        </div>
      </div>
    </main>
  );
}

export default function NewListingPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-6">
          <p className="text-[15px] font-bold">Loading…</p>
        </main>
      }
    >
      <Flow />
    </Suspense>
  );
}
