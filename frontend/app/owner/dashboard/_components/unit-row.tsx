import { inr } from "@/lib/listing-draft";
import type { DeleteDraftOutcome } from "@/lib/draft-delete";
import type { StudioUnit } from "@/lib/studio-data";
import { DeleteDraftAction } from "./delete-draft-action";
import { ListingLifecycleAction } from "./listing-lifecycle";

/**
 * One rental unit row inside a property group (Phase E). Read-only
 * portfolio visibility: kind, lifecycle and availability as separate
 * lines, headline rent when a usable RENT component exists. No actions —
 * lifecycle controls belong to future work.
 */

const LIFECYCLE_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  PAUSED: "Paused",
  RENTED: "Rented",
  ARCHIVED: "Archived",
};

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatShortDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return iso;
  return `${Number(match[3])} ${month} ${match[1]}`;
}

function availabilityLine(unit: StudioUnit): string {
  const listing = unit.listing;
  if (!listing) return "Not listed yet";
  switch (listing.availability.status) {
    case "AVAILABLE_NOW":
      return "Available now";
    case "AVAILABLE_FROM_DATE":
      return listing.availability.availableFrom
        ? `Available from ${formatShortDate(listing.availability.availableFrom)}`
        : "Available from date";
    case "OCCUPIED":
      return "Currently full";
    default:
      return listing.availability.status;
  }
}

function rentLine(unit: StudioUnit): string | null {
  const rent = unit.listing?.rent;
  if (!rent) return "Rent on request";
  // amountPaise is backend paise; inr() formats whole rupees.
  const amount = inr(rent.amountPaise / 100);
  return rent.billingFrequency === "MONTHLY" ? `${amount}/month` : amount;
}

export function UnitRow({
  unit,
  onListingChanged,
  onEditListing,
  onDeleteListing,
}: {
  unit: StudioUnit;
  onListingChanged: () => void;
  /** Opens the listing wizard in edit mode. Absent when there is no listing. */
  onEditListing?: (listingId: number) => void;
  /** Deletes an unfinished DRAFT listing. Offered for DRAFT only —
   * PUBLISHED/PAUSED/RENTED/ARCHIVED and unlisted units get no action. */
  onDeleteListing?: (listingId: number, lifecycle: string) => Promise<DeleteDraftOutcome>;
}) {
  const lifecycle = unit.listing
    ? (LIFECYCLE_LABELS[unit.listing.lifecycle] ?? unit.listing.lifecycle)
    : null;
  const listingId = unit.listing?.id ?? null;
  // Backend lifecycle verbatim (not the display label): Delete is offered
  // only for a genuinely DRAFT listing.
  const listingLifecycle = unit.listing?.lifecycle ?? null;
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <h2
        className="truncate text-[14.5px] font-bold tracking-tight"
        title={unit.displayKind}
      >
        {unit.displayKind}
      </h2>
      {unit.listing && (
        <p
          className="mt-0.5 truncate text-[13.5px] text-muted"
          title={unit.listing.title}
        >
          {unit.listing.title}
        </p>
      )}
      {lifecycle && (
        <p className="mt-0.5 text-[13.5px] font-semibold">{lifecycle}</p>
      )}
      <p className="mt-0.5 truncate text-[13px] text-muted">
        {availabilityLine(unit)}
        {unit.listing ? ` · ${rentLine(unit)}` : ""}
      </p>
      {unit.listing && listingId !== null && (
        <div className="mt-2 flex flex-wrap gap-2">
          {onEditListing && (
            <button
              type="button"
              onClick={() => onEditListing(listingId)}
              aria-label={`Edit ${unit.listing.title}`}
              className="flex min-h-[48px] items-center justify-center rounded-xl border border-line bg-white px-4 text-[14px] font-bold transition active:scale-[0.98] sm:w-auto"
            >
              Edit
            </button>
          )}
          <ListingLifecycleAction
            listingId={unit.listing.id}
            lifecycle={unit.listing.lifecycle}
            onChanged={onListingChanged}
          />
          {unit.listing &&
            listingId !== null &&
            listingLifecycle === "DRAFT" &&
            onDeleteListing && (
              <DeleteDraftAction
                presentation="inline"
                label={unit.listing.title}
                onDelete={() => onDeleteListing(listingId, listingLifecycle)}
              />
            )}
        </div>
      )}
    </div>
  );
}
