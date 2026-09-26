import { useRef, useState } from "react";
import { pauseOwnerListing, publishOwnerListing } from "@/lib/api";

/**
 * Pause / Resume action for one listing (Phase F). Renders only for
 * PUBLISHED (Pause, with inline confirmation) and PAUSED (Resume,
 * direct). Guards live on the backend — this component never decides
 * whether a transition is allowed, it only reports the backend's answer.
 * No optimistic status: the button disables while in flight, and the
 * parent reloads authoritative Studio data on success.
 */

const ACTION_CLASSES =
  "flex min-h-[48px] w-full items-center justify-center rounded-xl border border-line bg-white px-4 text-[14px] font-bold transition active:scale-[0.98] disabled:opacity-50 sm:w-auto";

export function ListingLifecycleAction({
  listingId,
  lifecycle,
  onChanged,
  pauseListing = pauseOwnerListing,
  publishListing = publishOwnerListing,
}: {
  listingId: number;
  lifecycle: string;
  /** Called after a successful transition so the parent reloads. */
  onChanged: () => void;
  /** Injectable for tests; defaults are the real API helpers. */
  pauseListing?: (id: number) => Promise<unknown>;
  publishListing?: (id: number) => Promise<unknown>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Synchronous single-flight guard (mirrors the Retry submit guard):
  // React state hasn't flushed on a same-tick second click, so the ref —
  // set before the API call, cleared in `finally` — is what actually
  // prevents a duplicate request. `sending` remains purely for UI.
  const sendingRef = useRef(false);

  if (lifecycle !== "PUBLISHED" && lifecycle !== "PAUSED") return null;

  const run = async (action: "pause" | "resume") => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setError(null);
    try {
      if (action === "pause") {
        await pauseListing(listingId);
      } else {
        await publishListing(listingId);
      }
      setConfirming(false);
      onChanged();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't update the listing."
      );
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  if (lifecycle === "PAUSED") {
    return (
      <div className="mt-2">
        <button
          type="button"
          onClick={() => void run("resume")}
          disabled={sending}
          className={ACTION_CLASSES}
        >
          {sending ? "Resuming…" : "Resume"}
        </button>
        {error && (
          <div className="mt-2 flex flex-col gap-2">
            <p className="text-[13px] leading-relaxed text-red-600" role="alert">
              {error}
            </p>
            <button
              type="button"
              onClick={() => void run("resume")}
              disabled={sending}
              className={ACTION_CLASSES}
            >
              {sending ? "Resuming…" : "Try again"}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2">
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-expanded={false}
          className={ACTION_CLASSES}
        >
          Pause
        </button>
      ) : (
        <div className="rounded-xl border border-line bg-paper p-3">
          <p className="text-[14px] font-bold">Pause this listing?</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            Renters won&apos;t see this listing while it&apos;s paused. You
            can resume it later.
          </p>
          {error && (
            <p
              className="mt-1.5 text-[13px] leading-relaxed text-red-600"
              role="alert"
            >
              {error}
            </p>
          )}
          <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => void run("pause")}
              disabled={sending}
              aria-expanded={true}
              className="flex min-h-[48px] flex-1 items-center justify-center rounded-xl bg-brand-600 px-4 text-[14.5px] font-bold text-white transition active:scale-[0.98] disabled:opacity-50"
            >
              {sending ? "Pausing…" : error ? "Try again" : "Confirm pause"}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                setError(null);
              }}
              disabled={sending}
              className="flex min-h-[48px] flex-1 items-center justify-center rounded-xl border border-line bg-white px-4 text-[14.5px] font-semibold transition active:scale-[0.98] disabled:opacity-50"
            >
              Keep live
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
