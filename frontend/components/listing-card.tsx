import Link from "next/link";
import PhotoFrame from "@/components/photo-frame";
import type { PublicListingSummary } from "@/lib/public-listings";
import {
  displayAvailability,
  displayLocation,
  displayUnitLine,
  monthlyPrice,
} from "@/lib/public-listing-view";

function PinIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <path
        d="M12 21s-6.5-5.3-6.5-10A6.5 6.5 0 0 1 12 4.5 6.5 6.5 0 0 1 18.5 11c0 4.7-6.5 10-6.5 10Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="11" r="2.2" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/**
 * Public renter listing card.
 *
 * The visual structure intentionally follows the design-prototype
 * PropertyCard: rounded image card, title hierarchy, monthly price line,
 * unit line, and location footer. Prototype-only fields are omitted
 * rather than replaced with fake values: there is no save control
 * (saved listings are deferred), no rating, no verification badge, and
 * no commute distance. Availability is shown as an overlay chip because
 * it is the only per-listing status the public API exposes.
 */
export default function ListingCard({
  listing,
}: {
  listing: PublicListingSummary;
}) {
  const title = listing.title.trim() || "Untitled listing";
  const price = monthlyPrice(listing);
  const availability = displayAvailability(
    listing.availability_status,
    null
  );
  const availableFrom =
    listing.availability_status === "AVAILABLE_FROM_DATE"
      ? displayAvailability(
          listing.availability_status,
          listing.available_from
        )
      : availability;

  return (
    <article className="overflow-hidden rounded-xl border border-line bg-white">
      <div className="relative">
        <Link
          href={`/listings/${listing.id}`}
          aria-label={`Open details for ${title}`}
        >
          <PhotoFrame
            src={listing.cover_photo?.view_url ?? null}
            alt={title}
            className="aspect-[4/3] w-full"
          />
        </Link>
        <div className="absolute left-3 top-3">
          <span className="inline-flex items-center rounded-full bg-white/95 px-2.5 py-1 text-[11.5px] font-semibold text-ink shadow-sm">
            {availableFrom}
          </span>
        </div>
      </div>
      <Link href={`/listings/${listing.id}`} className="block p-3.5">
        <h3 className="text-[15.5px] font-bold leading-snug tracking-tight text-ink">
          {title}
        </h3>
        <p className="mt-1 text-[16px] font-extrabold tracking-tight text-ink">
          {price.amount ? (
            <>
              {price.prefix}
              {price.amount}{" "}
              <span className="text-[12.5px] font-semibold text-muted">
                {price.suffix}
              </span>
            </>
          ) : (
            price.unavailableLabel
          )}
        </p>
        {price.note && (
          <p className="mt-0.5 text-[12px] leading-snug text-muted">
            {price.note}
          </p>
        )}
        <p className="mt-1 text-[13px] text-muted">
          {displayUnitLine(listing.unit)}
        </p>
        <p className="mt-1.5 flex items-center gap-1.5 border-t border-line pt-2.5 text-[13px] font-medium text-brand-700">
          <PinIcon />
          <span className="min-w-0 truncate">
            {displayLocation(listing.property)}
          </span>
        </p>
      </Link>
    </article>
  );
}
