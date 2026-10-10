"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import type { FlowChapter, ListingDraft, PhotoItem, PhotoStatus } from "@/components/listing/types";
import { Chapter } from "../_components/flow-ui";

const img = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&q=60`;
const SAMPLE_IMGS = [
  img("photo-1522708323590-d24dbb6b0267"),
  img("photo-1505691938895-1758d7feb511"),
  img("photo-1556912167-f556f1f39fdf"),
  img("photo-1554995207-c18c203602cb"),
  img("photo-1484154218962-a197022b5858"),
  img("photo-1552321554-5fefe8c9ef14"),
  img("photo-1560448204-e02f11c3d0e2"),
  img("photo-1493809842364-78817add7ffb"),
];

function uid(): string {
  return `ph-${Math.random().toString(36).slice(2, 9)}`;
}

export function validatePhotos(_d: ListingDraft): string {
  return "";
}

export default function PhotosChapter({
  draft,
  save,
  go,
  back,
}: {
  draft: ListingDraft;
  save: (patch: Partial<ListingDraft>) => void;
  go: (c: FlowChapter) => void;
  back: () => void;
}) {
  const [photos, setPhotos] = useState<PhotoItem[]>(() =>
    [...draft.photos].sort((a, b) => a.order - b.order)
  );
  const ref = useRef(photos);
  const imgIdx = useRef(draft.photos.length);

  const commit = (next: PhotoItem[]) => {
    const ordered = next.map((p, i) => ({ ...p, order: i }));
    ref.current = ordered;
    setPhotos(ordered);
    save({ photos: ordered });
  };

  useEffect(() => {
    if (!ref.current.some((p) => p.status === "uploading")) return;
    const t = setTimeout(() => {
      commit(ref.current.map((p) => (p.status === "uploading" ? { ...p, status: "ready" as PhotoStatus } : p)));
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = (id: string, ok: boolean) =>
    commit(ref.current.map((p) => (p.id === id ? { ...p, status: ok ? "ready" : "failed" } : p)));

  const add = () => {
    if (ref.current.length >= 15) return;
    const item: PhotoItem = {
      id: uid(),
      img: SAMPLE_IMGS[imgIdx.current % SAMPLE_IMGS.length],
      status: "uploading",
      order: ref.current.length,
      cover: ref.current.length === 0,
    };
    imgIdx.current += 1;
    commit([...ref.current, item]);
    setTimeout(() => finish(item.id, Math.random() > 0.12), 900);
  };

  const retry = (id: string) => {
    commit(ref.current.map((p) => (p.id === id ? { ...p, status: "uploading" } : p)));
    setTimeout(() => finish(id, Math.random() > 0.12), 900);
  };

  const remove = (id: string) => {
    const next = ref.current.filter((p) => p.id !== id);
    if (next.length > 0 && !next.some((p) => p.cover)) next[0] = { ...next[0], cover: true };
    commit(next);
  };

  const move = (id: string, dir: -1 | 1) => {
    const arr = [...ref.current];
    const i = arr.findIndex((p) => p.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    commit(arr);
  };

  const readyCount = photos.filter((p) => p.status === "ready").length;

  return (
    <Chapter
      id="photos"
      kicker="Show the place"
      title="Show people the place"
      lede="Good photos help renters understand the space before they visit. Bright rooms, real angles — no filters needed."
      onContinue={() => go("price")}
      showBack
      onBack={back}
    >
      <div className="flex items-center justify-between rounded-2xl bg-[#EAF3FF] px-4 py-3">
        <span className="text-[14px] font-bold text-[#0F5BB5]">
          {Math.min(readyCount, 3)} of 3 minimum
        </span>
        <span className="text-[13px] font-semibold text-[#0F5BB5]">{photos.length}/15</span>
      </div>
      {readyCount < 3 && (
        <p className="mt-2 rounded-xl bg-[#EAF3FF] px-3.5 py-2.5 text-[13px] font-medium text-[#5B6B7C]">
          You&apos;ll need at least 3 photos before publishing — add them now or come back later.
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {photos.map((p, i) => (
          <div key={p.id} className="relative overflow-hidden rounded-2xl border border-[#E3E8EF] bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.img} alt={`Listing photo ${i + 1}`} className="aspect-[4/3] w-full object-cover" />
            {p.cover && (
              <span className="absolute left-2 top-2 rounded-full bg-[#1677E8] px-2.5 py-1 text-[11px] font-bold text-white">
                Cover
              </span>
            )}
            {p.status === "uploading" && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-[13px] font-bold text-white">
                Uploading…
              </span>
            )}
            {p.status === "failed" && (
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/55 px-3 text-center">
                <span className="text-[13px] font-bold text-white">Couldn&apos;t upload</span>
                <button
                  type="button"
                  onClick={() => retry(p.id)}
                  className="rounded-lg bg-white px-3 py-1.5 text-[13px] font-bold text-[#0F5BB5]"
                >
                  Retry
                </button>
              </span>
            )}
            <div className="flex items-center justify-between gap-1 p-1.5">
              <div className="flex gap-1">
                <button type="button" onClick={() => move(p.id, -1)} aria-label={`Move photo ${i + 1} earlier`}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EAF3FF] transition active:scale-95">
                  <Icon name="back" size={16} />
                </button>
                <button type="button" onClick={() => move(p.id, 1)} aria-label={`Move photo ${i + 1} later`}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EAF3FF] transition active:scale-95">
                  <Icon name="chevR" size={16} />
                </button>
              </div>
              <div className="flex gap-1">
                {!p.cover && p.status === "ready" && (
                  <button type="button" onClick={() => commit(ref.current.map((x) => ({ ...x, cover: x.id === p.id })))}
                    aria-label={`Make photo ${i + 1} the cover`}
                    className="flex h-10 items-center rounded-xl bg-[#EAF3FF] px-2.5 text-[12.5px] font-bold text-[#0F5BB5] transition active:scale-95">
                    Cover
                  </button>
                )}
                <button type="button" onClick={() => remove(p.id)} aria-label={`Remove photo ${i + 1}`}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EAF3FF] text-[#5B6B7C] transition active:scale-95">
                  <Icon name="close" size={16} />
                </button>
              </div>
            </div>
          </div>
        ))}
        {photos.length < 15 && (
          <button
            type="button"
            onClick={add}
            className="flex min-h-[190px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#E3E8EF] bg-white/60 text-[#5B6B7C] transition active:scale-[0.99]"
          >
            <Icon name="plus" size={26} />
            <span className="text-[14px] font-bold">Add photo</span>
            <span className="text-[12px]">Demo upload — simulated</span>
          </button>
        )}
      </div>
      {photos.length >= 15 && (
        <p role="alert" className="mt-3 rounded-xl bg-[#FDECEA] px-3.5 py-2.5 text-[13.5px] font-medium text-[#C0352B]">
          15 photos is the maximum — remove one to add another.
        </p>
      )}
    </Chapter>
  );
}
