import type { StudioSummary } from "@/lib/studio-data";

function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function firstNameOf(displayName: string | null, email: string | null): string {
  const fromName = (displayName ?? "").split(/\s+/).filter(Boolean)[0];
  if (fromName) return fromName;
  const fromEmail = (email ?? "").split("@")[0]?.trim();
  if (fromEmail) return fromEmail;
  return "Owner";
}

/**
 * Slim identity strip (Phase B). Time-aware greeting + one real-data
 * summary line from StudioData.summary. Neutral fallbacks while loading
 * or on error — never placeholder numbers.
 */
export function IdentityStrip({
  displayName,
  email,
  summary,
  state,
}: {
  displayName: string | null;
  email: string | null;
  summary: StudioSummary | null;
  state: "ready" | "loading" | "error";
}) {
  const hour = new Date().getHours();
  const name = firstNameOf(displayName, email);
  const inProgress =
    (summary?.pendingCount ?? 0) + (summary?.localDraftCount ?? 0);
  const line =
    state === "loading"
      ? "Loading your studio…"
      : state === "error" || summary === null
        ? "Showing what’s saved on this device."
        : summary.listingCount === 0 && inProgress === 0
          ? "Nothing listed yet."
          : [
              `${summary.publishedCount} live`,
              `${summary.pausedCount} paused`,
              `${inProgress} in progress`,
            ].join(" · ");
  return (
    <div className="border-b border-line bg-white">
      <div className="mx-auto w-full max-w-6xl px-5 py-4 lg:px-8">
        <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-brand-700">
          Owner Studio
        </p>
        <h1 className="mt-0.5 truncate text-[20px] font-bold tracking-tight lg:text-[24px]">
          {greetingForHour(hour)}, {name}
        </h1>
        <p className="mt-0.5 truncate text-[13px] text-muted" role="status">
          {line}
        </p>
      </div>
    </div>
  );
}
