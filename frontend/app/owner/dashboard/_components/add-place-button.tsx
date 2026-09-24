import Link from "next/link";

/**
 * Primary Owner Studio entry point (Phase B). Uses the existing wizard
 * bootstrap route — no new draft-creation path, no duplicated store logic.
 */
export function AddPlaceButton({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/owner/listings/new"
      className={`flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-brand-600 text-[16px] font-bold text-white transition active:scale-[0.98] ${
        compact ? "px-5" : "w-full px-5"
      }`}
    >
      <span aria-hidden className="text-[18px] font-bold leading-none">
        +
      </span>
      Add place
    </Link>
  );
}
