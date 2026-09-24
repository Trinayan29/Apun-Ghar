import Link from "next/link";
import { OwnerSectionLabel } from "@/components/owner-ui";
import type { StudioAttention } from "@/lib/studio-data";

/**
 * Needs Attention section (Phase C). Renders data.attention in supplied
 * order — no re-sorting, no invented items. Cards are calm work items:
 * icon tile, action-oriented title, one-sentence reason, one action.
 * Absent entirely when there is nothing requiring attention.
 */

function SendIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 16V4.5m0 0 5 5m-5-5L7 9.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4.5 15v3.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V15"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 7.5V12l3 2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function titleFor(item: StudioAttention): string {
  return item.reason === "send-incomplete"
    ? "Finish sending your listing"
    : "Continue your draft";
}

function reasonFor(item: StudioAttention, draftTitle: string | null): string {
  const name = draftTitle ? `“${draftTitle}”` : null;
  if (item.reason === "send-incomplete") {
    const remaining = item.remainingSteps.length;
    if (remaining > 0) {
      return `${name ?? "Your listing"} is saved but still needs ${remaining} more ${
        remaining === 1 ? "step" : "steps"
      } before it can be sent.`;
    }
    return `${name ?? "Your listing"} is saved but not finished sending yet.`;
  }
  const days = item.draftAgeDays;
  if (typeof days === "number" && days > 1) {
    return `${name ?? "This draft"} hasn’t been updated in ${days} days.`;
  }
  return `${name ?? "This draft"} hasn’t been updated in a while.`;
}

const ACTION_CLASSES =
  "flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-brand-600 px-5 text-[16px] font-bold text-white transition active:scale-[0.98] disabled:opacity-50 sm:w-auto sm:min-w-[140px]";

function AttentionCard({
  item,
  draftTitle,
  sending,
  error,
  onRetry,
}: {
  item: StudioAttention;
  draftTitle: string | null;
  sending: boolean;
  error: string | null;
  onRetry: (draftId: string) => void;
}) {
  const isSend = item.reason === "send-incomplete";
  return (
    <article className="rounded-2xl border border-line bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <span
          aria-hidden
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"
        >
          {isSend ? <SendIcon /> : <ClockIcon />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-bold tracking-tight">
            {titleFor(item)}
          </h2>
          <p className="mt-0.5 text-[13.5px] leading-relaxed text-muted">
            {reasonFor(item, draftTitle)}
          </p>
          {error && (
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-red-600" role="alert">
              {error}
            </p>
          )}
        </div>
        {isSend ? (
          item.draftId && (
            <button
              type="button"
              onClick={() => onRetry(item.draftId as string)}
              disabled={sending}
              className={ACTION_CLASSES}
            >
              {sending ? "Sending…" : "Retry"}
            </button>
          )
        ) : (
          item.draftId && (
            <Link
              href={`/owner/listings/new?draft=${item.draftId}`}
              className={ACTION_CLASSES}
            >
              Continue
            </Link>
          )
        )}
      </div>
    </article>
  );
}

export function NeedsAttention({
  items,
  titles,
  sending,
  errors,
  onRetry,
}: {
  items: StudioAttention[];
  titles: Record<string, string | null>;
  sending: Record<string, boolean>;
  errors: Record<string, string | null>;
  onRetry: (draftId: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section aria-label="Needs attention">
      <OwnerSectionLabel>Needs attention</OwnerSectionLabel>
      <div className="mt-2.5 space-y-2.5">
        {items.map((item) => (
          <AttentionCard
            key={item.key}
            item={item}
            draftTitle={item.draftId ? (titles[item.draftId] ?? null) : null}
            sending={item.draftId ? (sending[item.draftId] ?? false) : false}
            error={item.draftId ? (errors[item.draftId] ?? null) : null}
            onRetry={onRetry}
          />
        ))}
      </div>
    </section>
  );
}
