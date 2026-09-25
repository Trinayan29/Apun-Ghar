import Link from "next/link";
import { BuildingIcon } from "@/components/owner-ui";
import type { StudioDraft } from "@/lib/studio-data";

/**
 * Single resumable draft card (Phase D). Read-only presentation over
 * StudioDraft: title with honest fallback, kind-derived state, relative
 * recency from the existing updatedAt, and a Continue link into the
 * existing wizard. No fetching, no mutations, no new draft creation.
 */

function formatRecency(updatedAt: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - updatedAt) / 60000);
  if (minutes < 1) return "Updated just now";
  if (minutes < 60) return `Updated ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Updated ${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Updated yesterday";
  return `Updated ${days} days ago`;
}

export function DraftCard({ draft }: { draft: StudioDraft }) {
  const title = draft.title ?? "Untitled listing";
  const state = draft.kind === "pending" ? "In progress" : "Draft";
  return (
    <article className="rounded-2xl border border-line bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <span
          aria-hidden
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"
        >
          <BuildingIcon />
        </span>
        <div className="min-w-0 flex-1">
          <h2
            className="truncate text-[15px] font-bold tracking-tight"
            title={title}
          >
            {title}
          </h2>
          <p className="mt-0.5 truncate text-[13.5px] text-muted">
            {state} · {formatRecency(draft.updatedAt, Date.now())}
          </p>
        </div>
        <Link
          href={`/owner/listings/new?draft=${draft.draftId}`}
          aria-label={`Continue ${title}`}
          className="flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-brand-600 px-5 text-[16px] font-bold text-white transition active:scale-[0.98] sm:w-auto sm:min-w-[140px]"
        >
          Continue
        </Link>
      </div>
    </article>
  );
}
