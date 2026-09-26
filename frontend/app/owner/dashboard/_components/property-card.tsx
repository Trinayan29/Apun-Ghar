import { BuildingIcon } from "@/components/owner-ui";
import type { StudioProperty } from "@/lib/studio-data";
import { UnitRow } from "./unit-row";

/**
 * One property group (Phase E). The header is a disclosure button:
 * owner-defined name identity ("Untitled property" for legacy unnamed
 * rows), concise location, and a real-data summary line. Address stays
 * in data for future detail screens but is not the visual identity.
 * First/single property starts expanded, the rest collapsed — local UI
 * state only, no store. Unit rows are informational; no actions yet.
 */

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  PG: "PG",
  HOSTEL: "Hostel",
  APARTMENT_FLAT: "Apartment",
  INDEPENDENT_HOUSE: "Independent house",
  ASSAM_TYPE_HOUSE: "Assam-type house",
  STUDIO_BUILDING: "Studio",
  OTHER: "Other",
};

function locationLine(property: StudioProperty): string | null {
  const parts = [property.locality ?? property.areaName, property.city].filter(
    (part): part is string => !!part && part.trim().length > 0
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

function summaryLine(property: StudioProperty): string {
  const units = property.units.length;
  if (units === 0) return "No units yet";
  const live = property.units.filter(
    (u) => u.listing?.lifecycle === "PUBLISHED"
  ).length;
  const paused = property.units.filter(
    (u) => u.listing?.lifecycle === "PAUSED"
  ).length;
  const parts = [`${units} ${units === 1 ? "unit" : "units"}`];
  if (live > 0) parts.push(`${live} live`);
  if (paused > 0) parts.push(`${paused} paused`);
  return parts.join(" · ");
}

export function PropertyCard({
  property,
  open,
  onToggle,
}: {
  property: StudioProperty;
  open: boolean;
  onToggle: () => void;
}) {
  const location = locationLine(property);
  const typeLabel =
    PROPERTY_TYPE_LABELS[property.propertyType] ?? property.propertyType;
  const name = property.name?.trim() ? property.name.trim() : "Untitled property";
  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-white">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`${open ? "Collapse" : "Expand"} ${name}`}
        className="flex min-h-[64px] w-full items-center gap-3 p-4 text-left sm:p-5"
      >
        <span
          aria-hidden
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"
        >
          <BuildingIcon />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className="block truncate text-[15px] font-bold tracking-tight"
            title={name}
          >
            {name}
          </span>
          <span className="mt-0.5 block truncate text-[13px] text-muted">
            {location ? `${typeLabel} · ${location}` : typeLabel}
          </span>
          <span className="mt-0.5 block text-[13px] text-muted">
            {summaryLine(property)}
          </span>
        </span>
        <span
          aria-hidden
          className={`shrink-0 text-[18px] font-bold text-muted transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          ⌄
        </span>
      </button>
      {open && property.units.length > 0 && (
        <div className="border-t border-line px-4 py-3 sm:px-5">
          <div className="divide-y divide-line">
            {property.units.map((unit) => (
              <UnitRow key={unit.id} unit={unit} />
            ))}
          </div>
        </div>
      )}
      {open && property.units.length === 0 && (
        <p className="border-t border-line px-4 py-3 text-[13.5px] text-muted sm:px-5">
          No rental units added yet.
        </p>
      )}
    </article>
  );
}
