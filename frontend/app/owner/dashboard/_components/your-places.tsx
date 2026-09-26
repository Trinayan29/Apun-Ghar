import { useState } from "react";
import { OwnerSectionLabel } from "@/components/owner-ui";
import type { StudioProperty } from "@/lib/studio-data";
import { PropertyCard } from "./property-card";

/**
 * Your Places section (Phase E). Property-first portfolio visibility
 * over data.properties: groups in data order, first group expanded,
 * the rest collapsed. Read-only; no actions, no fetching, no store.
 * Absent when the owner has no properties.
 */

export function YourPlaces({
  properties,
  onListingChanged,
}: {
  properties: StudioProperty[];
  onListingChanged: () => void;
}) {
  const [openIds, setOpenIds] = useState<ReadonlySet<number> | null>(null);
  if (properties.length === 0) return null;
  const open = openIds ?? new Set([properties[0].id]);
  const toggle = (id: number) => {
    setOpenIds((prev) => {
      const base = prev ?? new Set([properties[0].id]);
      const next = new Set(base);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  return (
    <section aria-label="Your places">
      <OwnerSectionLabel>Your places</OwnerSectionLabel>
      <div className="mt-2.5 space-y-2.5">
        {properties.map((property) => (
          <PropertyCard
            key={property.id}
            property={property}
            open={open.has(property.id)}
            onToggle={() => toggle(property.id)}
            onListingChanged={onListingChanged}
          />
        ))}
      </div>
    </section>
  );
}
