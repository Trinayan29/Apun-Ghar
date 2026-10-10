"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/store/AppStore";
import Icon from "@/components/Icon";
import { OwnerBottomNav, OwnerDesktopHeader } from "@/components/owner-ui";
import {
  effectiveCoverId,
  inr,
  priceSummary,
  type ListingDraft,
} from "@/components/listing/types";
import flowStyles from "../listings/new/flow.module.css";

function StatusPill({ status }: { status: ListingDraft["status"] }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
        status === "published"
          ? "bg-[#2F7D4F] text-white"
          : status === "paused"
            ? "bg-[#E3E8EF] text-[#5B6B7C]"
            : "bg-[#EAF3FF] text-[#0F5BB5]"
      }`}
    >
      {status === "draft" ? "In progress" : status}
    </span>
  );
}

function PlaceCard({
  draft,
  onOpen,
  onDelete,
  onPause,
  onResume,
}: {
  draft: ListingDraft;
  onOpen: () => void;
  onDelete: () => void;
  onPause: () => void;
  onResume: () => void;
}) {
  const ready = draft.photos.filter((p) => p.status === "ready");
  const coverId = effectiveCoverId(draft);
  const cover = ready.find((p) => p.id === coverId) ?? ready[0];
  const summary = priceSummary(draft);
  const title = draft.basics.title.trim() || "Untitled listing";
  const place = [draft.place.area, draft.place.city].filter(Boolean).join(", ");
  const doneCount = (draft.done ?? []).length;

  return (
    <article className="overflow-hidden rounded-2xl border border-[#E3E8EF] bg-white">
      <button type="button" onClick={onOpen} className="block w-full text-left" aria-label={`Open ${title}`}>
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover.img} alt="" className="aspect-[16/9] w-full object-cover" />
        ) : (
          <span className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-1.5 bg-[#EAF3FF] text-[#5B6B7C]">
            <Icon name="building" size={28} />
            <span className="text-[13px] font-semibold">Photos coming soon</span>
          </span>
        )}
      </button>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-[16px] font-bold">{title}</h3>
            <p className="mt-0.5 text-[13px] text-[#5B6B7C]">{place || "Area, City"}</p>
          </div>
          <StatusPill status={draft.status} />
        </div>
        <div className="mt-2 flex items-center gap-3 text-[13px] font-semibold">
          {summary.headline > 0 && <span>{inr(summary.headline)} / month</span>}
          {draft.status === "draft" && (
            <span className="text-[#5B6B7C]">{doneCount} of 11 sections done</span>
          )}
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onOpen}
            className="flex min-h-[48px] flex-1 items-center justify-center rounded-[14px] bg-[#1677E8] text-[15px] font-bold text-white transition active:scale-[0.98]"
          >
            {draft.status === "draft" ? "Continue" : "Open"}
          </button>
          {draft.status === "published" && (
            <button
              type="button"
              onClick={onPause}
              className="flex min-h-[48px] items-center justify-center rounded-[14px] border border-[#E3E8EF] px-4 text-[14px] font-bold transition active:scale-[0.98]"
            >
              Pause
            </button>
          )}
          {draft.status === "paused" && (
            <button
              type="button"
              onClick={onResume}
              className="flex min-h-[48px] items-center justify-center rounded-[14px] border border-[#E3E8EF] px-4 text-[14px] font-bold transition active:scale-[0.98]"
            >
              Resume
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${title}`}
            className="flex min-h-[48px] w-[52px] items-center justify-center rounded-[14px] border border-[#E3E8EF] text-[#5B6B7C] transition active:scale-95"
          >
            <Icon name="close" size={17} />
          </button>
        </div>
      </div>
    </article>
  );
}

export default function OwnerDashboard() {
  const router = useRouter();
  const { owner, drafts, createDraft, deleteDraft, setDraftStatus } = useApp();
  const name = owner?.name ?? "Owner";

  const startNew = () => {
    const id = createDraft();
    router.push(`/owner/listings/new?draft=${id}`);
  };
  const openDraft = (d: ListingDraft) => router.push(`/owner/listings/new?draft=${d.id}`);

  const live = drafts.filter((d) => d.status === "published");
  const paused = drafts.filter((d) => d.status === "paused");
  const inProgress = drafts.filter((d) => d.status === "draft");

  return (
    <main className={`${flowStyles.flow} flex min-h-dvh flex-col`}>
      <OwnerDesktopHeader name={name} />

      <div className="mx-auto w-full max-w-6xl flex-1 px-5 py-6 lg:px-8 lg:py-8">
        {/* Studio heading */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#1677E8]">
              Owner Studio
            </p>
            <h1 className={`${flowStyles.display} mt-1 text-[30px] leading-tight lg:text-[36px]`}>
              Your places
            </h1>
            <p className="mt-1 max-w-md text-[14px] text-[#5B6B7C]">
              {drafts.length === 0
                ? "Everything you list lives here."
                : `${live.length} live · ${paused.length} paused · ${inProgress.length} in progress`}
            </p>
          </div>
          {drafts.length > 0 && (
            <button
              type="button"
              onClick={startNew}
              className="flex min-h-[52px] items-center gap-2 rounded-[14px] bg-[#1677E8] px-5 text-[15px] font-bold text-white transition active:scale-[0.98]"
            >
              <Icon name="plus" size={18} /> Add place
            </button>
          )}
        </div>

        {drafts.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-[#E3E8EF] bg-white p-8 text-center sm:p-12">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EAF3FF] text-[#1677E8]">
              <Icon name="building" size={28} />
            </span>
            <h2 className={`${flowStyles.display} mx-auto mt-4 max-w-[20ch] text-[24px]`}>
              Your first place starts here
            </h2>
            <p className="mx-auto mt-2 max-w-[38ch] text-[14.5px] leading-relaxed text-[#5B6B7C]">
              Put your property on Apun-Ghar and start reaching renters. About ten minutes,
              one small step at a time.
            </p>
            <button
              type="button"
              onClick={startNew}
              className="mx-auto mt-5 flex min-h-[54px] w-full max-w-xs items-center justify-center rounded-[14px] bg-[#1677E8] text-[16px] font-bold text-white transition active:scale-[0.98]"
            >
              Add property
            </button>
          </div>
        ) : (
          <div className="mt-6 space-y-7">
            {inProgress.length > 0 && (
              <section aria-label="Needs attention">
                <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#5B6B7C]">
                  Needs attention
                </h2>
                <div className="mt-2.5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {inProgress.map((d) => (
                    <PlaceCard
                      key={d.id}
                      draft={d}
                      onOpen={() => openDraft(d)}
                      onDelete={() => deleteDraft(d.id)}
                      onPause={() => setDraftStatus(d.id, "paused")}
                      onResume={() => setDraftStatus(d.id, "published")}
                    />
                  ))}
                </div>
              </section>
            )}
            {live.length > 0 && (
              <section aria-label="Live listings">
                <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#5B6B7C]">
                  Live
                </h2>
                <div className="mt-2.5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {live.map((d) => (
                    <PlaceCard
                      key={d.id}
                      draft={d}
                      onOpen={() => openDraft(d)}
                      onDelete={() => deleteDraft(d.id)}
                      onPause={() => setDraftStatus(d.id, "paused")}
                      onResume={() => setDraftStatus(d.id, "published")}
                    />
                  ))}
                </div>
              </section>
            )}
            {paused.length > 0 && (
              <section aria-label="Paused listings">
                <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#5B6B7C]">
                  Paused
                </h2>
                <div className="mt-2.5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {paused.map((d) => (
                    <PlaceCard
                      key={d.id}
                      draft={d}
                      onOpen={() => openDraft(d)}
                      onDelete={() => deleteDraft(d.id)}
                      onPause={() => setDraftStatus(d.id, "paused")}
                      onResume={() => setDraftStatus(d.id, "published")}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* Honest future-state note — no fake numbers */}
        <div className="mt-8 rounded-2xl border border-dashed border-[#E3E8EF] bg-white/60 p-5">
          <p className="text-[14px] font-bold">Enquiries and visits</p>
          <p className="mt-1 max-w-[52ch] text-[13.5px] leading-relaxed text-[#5B6B7C]">
            When renters message you about a place, the conversation will start here —
            attached to the right listing.
          </p>
          <Link href="/owner/account" className="mt-2 inline-block text-[14px] font-bold text-[#1677E8]">
            View account →
          </Link>
        </div>
      </div>

      <OwnerBottomNav />
    </main>
  );
}
