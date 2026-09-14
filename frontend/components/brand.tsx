/** Shared Apun-Ghar brand mark (Slice 3B-4). */
export function BrandMark() {
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden
        className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 11.5 12 4l8 7.5"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M6.5 10.5V19a1 1 0 0 0 1 1H17a1 1 0 0 0 1-1v-8.5"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="text-[19px] font-bold tracking-tight">Apun-Ghar</span>
    </span>
  );
}
