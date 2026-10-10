"use client";

import { useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import {
  POLICY_ROWS,
  allReady,
  availabilityLine,
  effectiveCoverId,
  inr,
  isWholeHome,
  priceSummary,
  readiness,
  type FlowChapter,
  type ListingDraft,
} from "@/components/listing/types";
import { Chapter } from "../_components/flow-ui";

export default function ListingChapter({
  draft,
  go,
  back,
  onPublish,
  onPause,
}: {
  draft: ListingDraft;
  save: (patch: Partial<ListingDraft>) => void;
  go: (c: FlowChapter) => void;
  back: () => void;
  onPublish: () => void;
  onPause: () => void;
}) {
  const [photo, setPhoto] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [celebrating, setCelebrating] = useState(false);

  const ready = draft.photos
    .filter((p) => p.status === "ready")
    .sort((a, b) => a.order - b.order);
  const coverId = effectiveCoverId(draft);
  const gallery = [...ready.filter((p) => p.id === coverId), ...ready.filter((p) => p.id !== coverId)];
  const summary = priceSummary(draft);
  const checks = readiness(draft);
  const ok = allReady(draft);
  const s = draft.space;
  const live = draft.status === "published";

  const fact = (k: string, v: string) => (
    <div key={k} className="rounded-xl bg-[#F7F9FC] px-3 py-2.5">
      <p className="text-[12px] text-[#5B6B7C]">{k}</p>
      <p className="text-[14px] font-bold">{v}</p>
    </div>
  );

  const publish = () => {
    onPublish();
    setConfirming(false);
    setCelebrating(true);
  };

  return (
    <Chapter
      id="listing"
      kicker="The payoff"
      title="This is your listing"
      lede="Exactly what a renter will see. Read it like one — then go live when it feels right."
      onContinue={() => go("listing")}
      continueLabel={live ? "Done — back to top" : "Review again"}
      showBack
      onBack={back}
    >
      {draft.status === "published" && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl bg-[#2F7D4F] px-4 py-3 text-white">
          <Icon name="check" size={19} />
          <p className="text-[14.5px] font-bold">Live — renters can see this listing</p>
        </div>
      )}
      {draft.status === "paused" && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl bg-[#EAF3FF] px-4 py-3">
          <Icon name="clock" size={19} className="text-[#5B6B7C]" />
          <p className="text-[14.5px] font-bold text-[#5B6B7C]">Paused — hidden from renters</p>
        </div>
      )}
      {celebrating && draft.status === "published" && (
        <div className="mb-4 rounded-2xl border border-[#E3E8EF] bg-white p-6 text-center">
          <p className="text-[24px] font-extrabold tracking-tight">
            You&apos;re live
          </p>
          <p className="mt-1 text-[14px] text-[#5B6B7C]">
            Renters browsing {draft.place.area || "Guwahati"} can now find this place.
          </p>
          <div className="mt-4 grid gap-2">
            <button
              type="button"
              onClick={() => {
                setCelebrating(false);
                onPause();
              }}
              className="flex min-h-[52px] items-center justify-center rounded-[14px] border border-[#E3E8EF] bg-white text-[15px] font-bold"
            >
              Pause listing
            </button>
            <Link
              href="/owner/dashboard"
              className="flex min-h-[52px] items-center justify-center rounded-[14px] bg-[#1677E8] text-[16px] font-bold text-white"
            >
              Back to Studio
            </Link>
          </div>
        </div>
      )}

      {/* Gallery */}
      <div className="overflow-hidden rounded-2xl border border-[#E3E8EF] bg-white">
        <div className="relative">
          {gallery.length > 0 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={gallery[Math.min(photo, gallery.length - 1)].img}
              alt={draft.basics.title || "Listing photo"}
              className="aspect-[4/3] w-full object-cover"
            />
          ) : (
            <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 bg-[#EAF3FF] text-[#5B6B7C]">
              <Icon name="building" size={30} />
              <p className="text-[14px] font-semibold">Photos appear here</p>
            </div>
          )}
          {gallery.length > 1 && (
            <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
              {gallery.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPhoto(i)}
                  aria-label={`Photo ${i + 1}`}
                  className={`h-1.5 rounded-full transition ${i === Math.min(photo, gallery.length - 1) ? "w-6 bg-white" : "w-1.5 bg-white/60"}`}
                />
              ))}
            </div>
          )}
        </div>
        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-[19px] font-bold tracking-tight">
                {draft.basics.title.trim() || "Your headline"}
              </h3>
              <p className="mt-0.5 text-[14px] text-[#5B6B7C]">
                {[draft.place.locality, draft.place.area, draft.place.city].filter(Boolean).join(", ") || "Locality, City"}
              </p>
            </div>
            <button type="button" onClick={() => go("name")}
              className="shrink-0 rounded-lg bg-[#EAF3FF] px-3 py-1.5 text-[13px] font-bold text-[#0F5BB5]">
              Edit
            </button>
          </div>
        </div>
      </div>

      {/* Facts */}
      <div className="rounded-2xl border border-[#E3E8EF] bg-white p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-bold">The essentials</h3>
          <button type="button" onClick={() => go("space")}
            className="shrink-0 rounded-lg bg-[#EAF3FF] px-3 py-1.5 text-[13px] font-bold text-[#0F5BB5]">Edit</button>
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          {fact("Space", s.kind ? `${s.kind}${isWholeHome(s.kind) && s.layout ? ` · ${s.layout}` : ""}${s.beds ? ` · ${s.beds} beds` : ""}` : "—")}
          {fact("For", s.audience || "Anyone")}
          {fact("Furnishing", s.furnishing || "—")}
          {fact(
            "Details",
            [s.bathrooms && `${s.bathrooms} bath`, s.floorNo && `${s.floorNo} floor`, s.carpetArea && `${s.carpetArea} sq ft`]
              .filter(Boolean)
              .join(" · ") || "—"
          )}
        </div>
      </div>

      {/* Price */}
      <div className="rounded-2xl border border-[#E3E8EF] bg-white p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-bold">Price breakdown</h3>
          <button type="button" onClick={() => go("price")}
            className="shrink-0 rounded-lg bg-[#EAF3FF] px-3 py-1.5 text-[13px] font-bold text-[#0F5BB5]">Edit</button>
        </div>
        <div className="mt-2.5 space-y-2 text-[14px]">
          {draft.prices.filter((p) => !p.metered && p.kind !== "deposit").map((p) => (
            <div key={p.id} className="flex items-center justify-between">
              <span className="text-[#5B6B7C]">
                {p.kind === "rent" ? "Monthly rent" : `${p.kind === "other" ? p.label || "Other" : p.kind}${p.included ? "" : " (extra)"}`}
              </span>
              <span className="font-medium">{p.amount ? inr(Number(p.amount)) : "—"}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between rounded-xl bg-[#EAF3FF] px-3 py-2.5">
          <span className="text-[14px] font-semibold text-[#0F5BB5]">Estimated monthly cost</span>
          <span className="text-[17px] font-bold text-[#0F5BB5]">
            {summary.headline + summary.extras > 0 ? inr(summary.headline + summary.extras) : "—"}
          </span>
        </div>
        {summary.deposit > 0 && (
          <div className="mt-2.5 flex items-center justify-between text-[14px]">
            <span className="text-[#5B6B7C]">Refundable deposit (one-time)</span>
            <span className="font-semibold">{inr(summary.deposit)}</span>
          </div>
        )}
      </div>

      {/* Amenities / rules / availability */}
      {(s.amenities.length > 0 ||
        draft.basics.description ||
        s.houseRules ||
        s.fullyIndependent !== null ||
        s.pgFood !== "") && (
        <div className="rounded-2xl border border-[#E3E8EF] bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-bold">Amenities & rules</h3>
            <button type="button" onClick={() => go("included")}
              className="shrink-0 rounded-lg bg-[#EAF3FF] px-3 py-1.5 text-[13px] font-bold text-[#0F5BB5]">Edit</button>
          </div>
          {s.amenities.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {s.amenities.map((a) => (
                <span key={a} className="rounded-full bg-[#EAF3FF] px-3 py-1.5 text-[13px] font-semibold">{a}</span>
              ))}
            </div>
          )}
          {draft.basics.description && <p className="mt-2.5 text-[14px] leading-relaxed">{draft.basics.description}</p>}
          <div className="mt-2 space-y-1.5">
            {POLICY_ROWS.filter((r) => s.policies[r.key] !== null).map((r) => (
              <p key={r.key} className="flex items-center gap-2 text-[13.5px]">
                <Icon name={s.policies[r.key] ? "check" : "close"} size={15}
                  className={s.policies[r.key] ? "text-[#2F7D4F]" : "text-[#5B6B7C]"} />
                {r.label} {s.policies[r.key] ? "allowed" : "not allowed"}
              </p>
            ))}
            {s.fullyIndependent === true && (
              <p className="flex items-center gap-2 text-[13.5px]">
                <Icon name="check" size={15} className="text-[#2F7D4F]" />
                Fully independent
              </p>
            )}
            {s.fullyIndependent === false && (
              <p className="flex items-center gap-2 text-[13.5px]">
                <Icon name="close" size={15} className="text-[#5B6B7C]" />
                Shares entrance with owner
              </p>
            )}
            {(draft.place.buildingType === "PG" || draft.place.buildingType === "Hostel") &&
              s.pgFood !== "" && (
              <p className="flex items-center gap-2 text-[13.5px]">
                <Icon name="check" size={15} className="text-[#2F7D4F]" />
                {s.pgFood === "included"
                  ? "Food included in rent"
                  : s.pgFood === "separate"
                    ? "Food available separately"
                    : "No food provided"}
              </p>
            )}
            {(draft.place.buildingType === "PG" || draft.place.buildingType === "Hostel") &&
              s.pgCurfew === true && draft.place.gateTime && (
              <p className="flex items-center gap-2 text-[13.5px]">
                <Icon name="clock" size={15} className="text-[#5B6B7C]" />
                Gate closes at {draft.place.gateTime}
              </p>
            )}
          </div>
          {s.houseRules.trim() && (
            <p className="mt-2 rounded-xl bg-[#F7F9FC] px-3 py-2.5 text-[13.5px] leading-relaxed">{s.houseRules}</p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between rounded-2xl border border-[#E3E8EF] bg-white p-4">
        <div>
          <h3 className="text-[15px] font-bold">Availability</h3>
          <p className="text-[14px] text-[#5B6B7C]">{availabilityLine(draft)}</p>
        </div>
        <button type="button" onClick={() => go("movein")}
          className="shrink-0 rounded-lg bg-[#EAF3FF] px-3 py-1.5 text-[13px] font-bold text-[#0F5BB5]">Edit</button>
      </div>

      {/* Readiness */}
      <div className="rounded-2xl bg-[#17202A] p-5 text-white">
        <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-white/60">Almost ready to go live</p>
        <ul className="mt-3 space-y-2.5">
          {checks.map((c) => (
            <li key={c.key} className="flex items-center gap-2.5">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${c.ok ? "bg-[#2F7D4F]" : "bg-white/15"}`}>
                <Icon name={c.ok ? "check" : "clock"} size={15} />
              </span>
              <span className="flex-1">
                <span className="block text-[14px] font-bold">{c.label}</span>
                <span className="block text-[12.5px] text-white/65">{c.detail}</span>
              </span>
              {!c.ok && (
                <button type="button" onClick={() => go(c.step)}
                  className="shrink-0 rounded-lg bg-white/12 px-3 py-1.5 text-[13px] font-bold">
                  Fix →
                </button>
              )}
            </li>
          ))}
        </ul>
        {draft.status !== "published" ? (
          <button
            type="button"
            disabled={!ok}
            onClick={() => setConfirming(true)}
            className="mt-4 flex min-h-[52px] w-full items-center justify-center rounded-[14px] bg-white text-[16px] font-bold text-[#17202A] transition active:scale-[0.98] disabled:opacity-40"
          >
            Publish listing
          </button>
        ) : (
          <button
            type="button"
            onClick={onPause}
            className="mt-4 flex min-h-[52px] w-full items-center justify-center rounded-[14px] border border-white/25 text-[15.5px] font-bold transition active:scale-[0.98]"
          >
            Pause listing
          </button>
        )}
        {draft.status === "paused" && (
          <button
            type="button"
            disabled={!ok}
            onClick={() => setConfirming(true)}
            className="mt-2 flex min-h-[52px] w-full items-center justify-center rounded-[14px] bg-white text-[16px] font-bold text-[#17202A] transition active:scale-[0.98] disabled:opacity-40"
          >
            Publish again
          </button>
        )}
      </div>

      {confirming && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/45 sm:items-center" role="dialog" aria-modal="true" aria-label="Confirm publish">
          <div className="w-full max-w-md rounded-t-3xl bg-white p-6 pb-8 sm:rounded-3xl">
            <h3 className="text-[18px] font-bold">Publish this listing?</h3>
            <p className="mt-1.5 text-[14px] leading-relaxed text-[#5B6B7C]">
              Your listing will become visible to renters. You can pause it anytime.
            </p>
            <div className="mt-5 grid gap-2">
              <button
                type="button"
                onClick={publish}
                className="flex min-h-[52px] items-center justify-center rounded-[14px] bg-[#1677E8] text-[16px] font-bold text-white"
              >
                Yes, publish
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="flex min-h-[52px] items-center justify-center rounded-[14px] border border-[#E3E8EF] text-[15.5px] font-bold"
              >
                Keep editing
              </button>
            </div>
          </div>
        </div>
      )}
    </Chapter>
  );
}
