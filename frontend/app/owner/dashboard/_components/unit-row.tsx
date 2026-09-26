import { inr } from "@/lib/listing-draft";
import type { StudioUnit } from "@/lib/studio-data";

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

export function UnitRow({ unit }: { unit: StudioUnit }) {
  const lifecycle = unit.listing
    ? (LIFECYCLE_LABELS[unit.listing.lifecycle] ?? unit.listing.lifecycle)
    : null;
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
    </div>
  );
}
