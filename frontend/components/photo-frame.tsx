"use client";

import { useEffect, useState } from "react";

function FallbackIcon() {
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="text-brand-200"
    >
      <path
        d="M4 11.5 12 4l8 7.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 10.5V19a1 1 0 0 0 1 1H17a1 1 0 0 0 1-1v-8.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Listing image with the same graceful failure behaviour as the owner
 * preview: a failed or missing URL renders a branded placeholder rather
 * than a broken image. Plain <img> is intentional because presigned B2
 * URLs are arbitrary hosts and the app does not configure next/image.
 */
export default function PhotoFrame({
  src,
  alt,
  className = "",
  fallbackLabel = "No photo available",
}: {
  src: string | null;
  alt: string;
  className?: string;
  fallbackLabel?: string;
}) {
  const [failed, setFailed] = useState(false);
  // A new source deserves a fresh attempt: without this, a gallery that
  // moves from a failed image to a valid one would stay on the fallback.
  useEffect(() => {
    setFailed(false);
  }, [src]);
  if (!src || failed) {
    return (
      <div
        role="img"
        aria-label={fallbackLabel}
        className={`flex items-center justify-center gap-2 bg-brand-50 text-brand-700 ${className}`}
      >
        <FallbackIcon />
        <span className="px-2 text-center text-[13px] font-semibold">
          {fallbackLabel}
        </span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`bg-brand-50 object-cover ${className}`}
    />
  );
}
