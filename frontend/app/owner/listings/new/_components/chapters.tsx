"use client";

import { useEffect, useRef, useState } from "react";
import { Field, FormError, TextField } from "@/components/auth-ui";
import { LocationSearchField } from "@/components/location-search";
import { ChoiceGrid, ClearableChoice, SegmentedStrip, Stepper } from "@/components/ui/choices";
import { FormSection } from "@/components/ui/wizard";
import Link from "next/link";
import {
  BUILDING_KINDS,
  EXTRA_FREQUENCIES,
  EXTRA_KINDS,
  FURNISHINGS,
  POLICY_ROWS,
  RENTAL_KINDS,
  validateName,
  allReady,
  availabilityLine,
  effectiveCoverId,
  inr,
  isWholeHomeKind,
  parseRupees,
  readiness,
  suggestTitle,
  type AvailabilityDraft,
  type ChapterId,
  type ExtraChargeDraft,
  type ExtraKind,
  type ListingDraft,
  type ListingIdentityDraft,
  type LocalPublishState,
  type PhotoDraft,
  type PlaceDraft,
  type PricingDraft,
  type PropertySource,
  type SpaceDraft,
} from "@/lib/listing-draft";
import { submitSuccessMessage } from "@/lib/listing-submit-action";
import type { SubmitResult } from "@/lib/listing-submit-flow";
import {
  deleteListingPhoto,
  getOwnerListing,
  patchListingPhoto,
  type OwnerPhotoItem,
  type OwnerPropertyItem,
} from "@/lib/api";
import {
  resolveMime,
  uploadPhoto,
  validatePhotoFile,
  type AcceptedMime,
} from "@/lib/photo-upload";

/* ------------------------------------------------------------------ */
/* Chapter 1 — What are you renting?                                   */
/* ------------------------------------------------------------------ */

export function WhatChapter({
  space,
  onSpace,
  onResetBasis,
  error,
}: {
  space: SpaceDraft;
  onSpace: (patch: Partial<SpaceDraft>) => void;
  /** Clears a stored rent basis that the new kind makes incompatible. */
  onResetBasis: () => void;
  error: string | null;
}) {
  const pickKind = (kind: SpaceDraft["kind"]) => {
    // Explicit transitions: kind-dependent state never survives a change.
    // Rent basis is re-derived in the price chapter, so a stale stored
    // value (e.g. "room" after switching to a whole-home kind) is cleared.
    if (kind !== space.kind) onResetBasis();
    onSpace({
      kind,
      detail: kind === "other" ? space.detail : "",
      beds: kind === "shared" ? space.beds : null,
    });
  };

  return (
    <FormSection
      id="chapter-what"
      kicker="First things first"
      title="What are you renting?"
      lede="Pick the closest match. The next questions adapt to exactly this — nothing extra."
    >
      <ChoiceGrid
        label="What are you renting"
        value={space.kind}
        onPick={pickKind}
        options={RENTAL_KINDS}
      />
      {space.kind === "other" && (
        <div className="mt-4">
          <Field id="what-detail" label="What are you renting?">
            <TextField
              id="what-detail"
              type="text"
              autoComplete="off"
              placeholder="e.g. A shop shutter with a loft"
              value={space.detail}
              onChange={(v) => onSpace({ detail: v.slice(0, 80) })}
            />
          </Field>
        </div>
      )}
      {space.kind === "shared" && (
        <div className="mt-4 rounded-2xl border border-line bg-white p-4">
          <p className="text-[14.5px] font-bold">How many beds are in this room?</p>
          <div className="mt-2.5">
            <SegmentedStrip
              label="Beds in room"
              value={space.beds}
              onPick={(beds) => onSpace({ beds })}
              options={[
                { value: 2, label: "2" },
                { value: 3, label: "3" },
                { value: 4, label: "4" },
                { value: 5, label: "5+" },
              ]}
            />
          </div>
        </div>
      )}
      {error && (
        <div className="mt-4">
          <FormError message={error} />
        </div>
      )}
    </FormSection>
  );
}

/* ------------------------------------------------------------------ */
/* Chapter 2 — What kind of place is it?                               */
/* ------------------------------------------------------------------ */

export function KindChapter({
  place,
  onPlace,
  onLeavePgBuilding,
  error,
}: {
  place: PlaceDraft;
  onPlace: (patch: Partial<PlaceDraft>) => void;
  /** Clears PG/hostel-only space state. Called when leaving PG/Hostel. */
  onLeavePgBuilding: () => void;
  error: string | null;
}) {
  return (
    <FormSection
      id="chapter-kind"
      kicker="The building"
      title="What kind of place is it?"
      lede="This is about the building — the room or flat itself comes next."
    >
      <ChoiceGrid
        label="Building type"
        value={place.buildingType}
        onPick={(buildingType) => {
          const wasPg = place.buildingType === "PG" || place.buildingType === "HOSTEL";
          const staysPg = buildingType === "PG" || buildingType === "HOSTEL";
          // PG/hostel-only state must never survive a switch away.
          if (wasPg && !staysPg) onLeavePgBuilding();
          onPlace({
            buildingType,
            buildingOther: buildingType === "OTHER" ? place.buildingOther : "",
          });
        }}
        options={BUILDING_KINDS}
      />
      {place.buildingType === "OTHER" && (
        <div className="mt-4">
          <Field id="kind-other" label="What kind of place is it?">
            <TextField
              id="kind-other"
              type="text"
              autoComplete="off"
              placeholder="e.g. Farmhouse outhouse"
              value={place.buildingOther}
              onChange={(v) => onPlace({ buildingOther: v.slice(0, 80) })}
            />
          </Field>
        </div>
      )}
      {error && (
        <div className="mt-4">
          <FormError message={error} />
        </div>
      )}
    </FormSection>
  );
}

/* ------------------------------------------------------------------ */
/* Chapter — Choose a property (existing place vs new place)           */
/* ------------------------------------------------------------------ */

function propertyTypeLabel(propertyType: string): string {
  return BUILDING_KINDS.find((k) => k.value === propertyType)?.title ?? propertyType;
}

function propertyLocationLine(item: OwnerPropertyItem): string | null {
  const parts = [
    item.locality?.trim() ||
      item.area_location?.name.trim() ||
      item.area_custom_name?.trim() ||
      "",
    item.city?.trim() || "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

export function ChoosePropertyChapter({
  properties,
  unitsCount,
  propertiesError,
  onRetryProperties,
  propertySource,
  selectedPropertyId,
  onSelectNew,
  onSelectExisting,
  error,
}: {
  /** Null while the owner's properties are still loading. */
  properties: OwnerPropertyItem[] | null;
  /** Unit counts by property id; missing entries hide the count line. */
  unitsCount: Record<number, number>;
  propertiesError: string | null;
  onRetryProperties: () => void;
  propertySource: PropertySource;
  selectedPropertyId: number | null;
  onSelectNew: () => void;
  onSelectExisting: (item: OwnerPropertyItem) => void;
  error: string | null;
}) {
  const selectedCard = (selected: boolean) =>
    `w-full rounded-2xl border p-4 text-left transition active:scale-[0.99] ${
      selected
        ? "border-brand-600 bg-brand-50"
        : "border-line bg-white"
    }`;
  return (
    <FormSection
      id="chapter-chooseproperty"
      kicker="One listing, one place"
      title="Where does this listing belong?"
      lede="Reuse a place you already manage, or start a brand-new property."
    >
      {properties === null && !propertiesError && (
        <p className="text-[14px] text-muted" role="status">
          Loading your properties…
        </p>
      )}
      {propertiesError && (
        <div className="mb-3">
          <FormError message={propertiesError} />
          <button
            type="button"
            onClick={onRetryProperties}
            className="mt-2 flex min-h-[48px] w-full items-center justify-center rounded-xl border border-line bg-white px-5 text-[15px] font-semibold"
          >
            Retry
          </button>
        </div>
      )}
      {properties !== null && (
        <div className="space-y-2.5" role="group" aria-label="Choose a property">
          {properties.map((item) => {
            const selected =
              propertySource === "existing" && selectedPropertyId === item.id;
            const name = item.name?.trim() || item.address_line.trim();
            const location = propertyLocationLine(item);
            const units = unitsCount[item.id];
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectExisting(item)}
                aria-pressed={selected}
                className={selectedCard(selected)}
              >
                <span className="block truncate text-[15.5px] font-bold" title={name}>
                  {name}
                </span>
                <span className="mt-0.5 block text-[13px] text-muted">
                  {propertyTypeLabel(item.property_type)}
                  {location ? ` · ${location}` : ""}
                </span>
                {typeof units === "number" && (
                  <span className="mt-0.5 block text-[13px] text-muted">
                    {units === 1 ? "1 unit" : `${units} units`}
                  </span>
                )}
              </button>
            );
          })}
          <button
            type="button"
            onClick={onSelectNew}
            aria-pressed={propertySource === "new"}
            className={selectedCard(propertySource === "new")}
          >
            <span className="block text-[15.5px] font-bold">
              <span aria-hidden className="mr-1.5">
                +
              </span>
              Create a new property
            </span>
            <span className="mt-0.5 block text-[13px] text-muted">
              Add a new address and name in the next steps.
            </span>
          </button>
        </div>
      )}
      {error && (
        <div className="mt-4">
          <FormError message={error} />
        </div>
      )}
    </FormSection>
  );
}

/* ------------------------------------------------------------------ */
/* Chapter 3 — Where is it?                                            */
/* ------------------------------------------------------------------ */

export function WhereChapter({
  place,
  onPlace,
  error,
  lockedSourceName,
}: {
  place: PlaceDraft;
  onPlace: (patch: Partial<PlaceDraft>) => void;
  error: string | null;
  /**
   * When set, the chapter renders the selected property's location
   * read-only instead of inputs: the address belongs to the property and
   * is authoritative, not entered in this flow.
   */
  lockedSourceName?: string | null;
}) {
  const set = (patch: Partial<PlaceDraft>) => onPlace(patch);
  if (lockedSourceName != null) {
    const areaLine = [
      place.locality.trim() ||
      place.area?.name.trim() ||
      place.areaCustomName.trim() ||
      "",
      place.city.trim(),
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      <FormSection
        id="chapter-where"
        kicker="Finding you"
        title="Where's your place?"
        lede="This location comes from your selected property and isn't edited here."
      >
        <div className="rounded-2xl border border-line bg-white p-4">
          <p className="text-[15px] font-bold">{place.address.trim() || "Address on file"}</p>
          {areaLine && (
            <p className="mt-1 text-[13.5px] text-muted">{areaLine}</p>
          )}
          {place.pincode.trim() && (
            <p className="mt-1 text-[13.5px] text-muted">{place.pincode.trim()}</p>
          )}
        </div>
        {error && (
          <div className="mt-4">
            <FormError message={error} />
          </div>
        )}
      </FormSection>
    );
  }
  return (
    <FormSection
      id="chapter-where"
      kicker="Finding you"
      title="Where's your place?"
      lede="Start with the area — most renters search by neighbourhood, not street name."
    >
      <div className="space-y-4">
        {place.areaCustomName.trim() ? (
          <div>
            <Field id="where-area" label="Area">
              <div className="flex min-h-[52px] items-center justify-between gap-2 rounded-xl border border-line bg-white px-4">
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">
                  {place.areaCustomName.trim()}
                </span>
                <button
                  type="button"
                  onClick={() => set({ areaCustomName: "" })}
                  className="flex min-h-[44px] shrink-0 items-center px-1 text-[13px] font-bold text-brand-700 underline disabled:opacity-60"
                >
                  Clear
                </button>
              </div>
            </Field>
            <p className="mt-2 text-[13.5px] text-muted">
              Custom area — saved with your property as entered.
            </p>
          </div>
        ) : (
          <LocationSearchField
            kind="area"
            label="Area"
            placeholder="e.g. Beltola"
            value={place.area}
            onSelect={(area) => set({ area, areaCustomName: "" })}
            onClear={() => set({ area: null })}
            onUseCustomArea={(name) => set({ area: null, areaCustomName: name })}
          />
        )}
        <Field id="where-address" label="Building address">
          <TextField
            id="where-address"
            type="text"
            autoComplete="street-address"
            placeholder="House no., street, landmark"
            value={place.address}
            onChange={(v) => set({ address: v })}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="where-locality" label="Locality (optional)">
            <TextField
              id="where-locality"
              type="text"
              autoComplete="off"
              placeholder="e.g. Near Beltola Market"
              value={place.locality}
              onChange={(v) => set({ locality: v })}
            />
          </Field>
          <Field id="where-city" label="City">
            <TextField
              id="where-city"
              type="text"
              autoComplete="address-level2"
              placeholder="Guwahati"
              value={place.city}
              onChange={(v) => set({ city: v })}
            />
          </Field>
        </div>
        <Field id="where-pincode" label="Pincode (optional)">
          <TextField
            id="where-pincode"
            type="text"
            autoComplete="postal-code"
            placeholder="781028"
            value={place.pincode}
            onChange={(v) => set({ pincode: v.replace(/[^0-9]/g, "").slice(0, 6) })}
          />
        </Field>
        <LocationSearchField
          kind="college"
          label="Nearby college (optional)"
          placeholder="e.g. Cotton University"
          value={place.college}
          onSelect={(college) => set({ college })}
          onClear={() => set({ college: null })}
        />
        <LocationSearchField
          kind="workplace"
          label="Nearby workplace (optional)"
          placeholder="e.g. GNRC Hospital"
          value={place.workplace}
          onSelect={(workplace) => set({ workplace })}
          onClear={() => set({ workplace: null })}
        />
      </div>
      {error && (
        <div className="mt-4">
          <FormError message={error} />
        </div>
      )}
    </FormSection>
  );
}

/* ------------------------------------------------------------------ */
/* Chapter 4 — What do you call this place?                            */
/* ------------------------------------------------------------------ */

export function PlaceNameChapter({
  place,
  onPlace,
  error,
  lockedSourceName,
}: {
  place: Pick<PlaceDraft, "placeName">;
  onPlace: (patch: Partial<PlaceDraft>) => void;
  error: string | null;
  /**
   * When set, the selected property's name renders read-only: this
   * listing is added to that property, so the name isn't asked again.
   */
  lockedSourceName?: string | null;
}) {
  if (lockedSourceName != null) {
    return (
      <FormSection
        id="chapter-placename"
        kicker="Your place, your name"
        title="What do you call this place?"
        lede="This listing will be added to this property."
      >
        <div className="rounded-2xl border border-line bg-white p-4">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted">
            Property
          </p>
          <p className="mt-1 text-[16px] font-bold">{lockedSourceName}</p>
        </div>
        {error && (
          <div className="mt-3">
            <FormError message={error} />
          </div>
        )}
      </FormSection>
    );
  }
  return (
    <FormSection
      id="chapter-placename"
      kicker="Your place, your name"
      title="What do you call this place?"
      lede="Give this place a name so you can easily recognize it in your Owner Studio. Renters see your listing title instead — that question comes later."
    >
      <Field id="placename-name" label="Place name">
        <TextField
          id="placename-name"
          type="text"
          autoComplete="off"
          placeholder="e.g. Green View House"
          value={place.placeName}
          onChange={(v) => onPlace({ placeName: v.slice(0, 120) })}
        />
      </Field>
      <span className="mt-1 block text-right text-[12px] text-muted">
        {place.placeName.trim().length}/120
      </span>
      {error && (
        <div className="mt-3">
          <FormError message={error} />
        </div>
      )}
    </FormSection>
  );
}

/* ------------------------------------------------------------------ */
/* Chapter 5 - Tell us about the space                                 */
/* ------------------------------------------------------------------ */
/* Chapter 4 — Tell us about the space                                 */
/* ------------------------------------------------------------------ */

const LAYOUT_LABEL: Record<string, string> = {
  rk1: "1 RK",
  bhk1: "1 BHK",
  bhk2: "2 BHK",
  bhk3: "3 BHK",
  bhk4plus: "4 BHK+",
};

export function SpaceChapter({
  draft,
  onSpace,
  error,
}: {
  draft: { space: SpaceDraft };
  onSpace: (patch: Partial<SpaceDraft>) => void;
  error: string | null;
}) {
  const { space } = draft;
  const wholeHome = isWholeHomeKind(space.kind);
  return (
    <FormSection
      id="chapter-space"
      kicker="The space"
      title={
        wholeHome && space.kind
          ? `Tell us about this ${LAYOUT_LABEL[space.kind] ?? ""}`.trim()
          : space.kind === "shared" && space.beds
            ? "Tell us about the room"
            : space.kind === "pg_bed"
              ? "Tell us about the bed"
              : space.kind === "other"
                ? "Tell us about the space"
                : "Tell us about the room"
      }
      lede="Only what a renter would ask on a visit — nothing more."
    >
      {wholeHome && space.kind ? (
        <p className="mb-4 inline-block rounded-full bg-brand-50 px-3.5 py-1.5 text-[13.5px] font-bold text-brand-700">
          {LAYOUT_LABEL[space.kind]}
        </p>
      ) : space.kind === "shared" && space.beds ? (
        <p className="mb-4 inline-block rounded-full bg-brand-50 px-3.5 py-1.5 text-[13.5px] font-bold text-brand-700">
          {space.beds === 5 ? "5+ beds" : `${space.beds} beds`} · shared room
        </p>
      ) : space.kind === "single" ? (
        <p className="mb-4 inline-block rounded-full bg-brand-50 px-3.5 py-1.5 text-[13.5px] font-bold text-brand-700">
          Private room · just for you
        </p>
      ) : null}
      <p className="mb-1.5 text-[13px] font-semibold">How furnished is it?</p>
      <ChoiceGrid
        label="Furnishing"
        value={space.furnishing}
        onPick={(furnishing) => onSpace({ furnishing })}
        options={FURNISHINGS}
      />
      <div className="mt-4">
        <ClearableChoice
          label="Is this place fully independent?"
          hint="Private entrance and no shared living spaces with the owner."
          options={[
            { value: true, label: "Yes" },
            { value: false, label: "No" },
          ]}
          value={space.independent}
          clearValue={null}
          onPick={(independent) =>
            onSpace({ independent: independent as boolean | null })
          }
        />
      </div>

      <div className="mt-5">
        <p className="mb-2 text-[14px] font-bold">A few more details</p>
        <div className="space-y-2.5">
          {wholeHome ? (
            <div className="rounded-2xl border border-line bg-white px-4 py-3">
              <p className="text-[14.5px] font-semibold">How many bathrooms?</p>
              <div className="mt-2 flex gap-1.5" role="radiogroup" aria-label="Bathrooms">
                {["1", "2", "3+"].map((b) => {
                  const active = space.bathrooms === b;
                  return (
                    <button
                      key={b}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => onSpace({ bathrooms: active ? "" : b })}
                      className={`flex h-[52px] flex-1 items-center justify-center rounded-[14px] border text-[16px] font-bold transition active:scale-95 ${
                        active ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line bg-white"
                      }`}
                    >
                      {b}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <Stepper
              label="Bathrooms"
              value={Number(space.bathrooms) || 0}
              max={6}
              onChange={(v) => onSpace({ bathrooms: String(v) })}
            />
          )}
          <div className="rounded-2xl border border-line bg-white px-4 py-3">
            <p className="text-[14.5px] font-semibold">Which floor is it on?</p>
            <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Floor">
              {["Ground", "1", "2", "3", "4+", "Don't know"].map((f) => {
                const active = space.floorNo === f;
                return (
                  <button
                    key={f}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onSpace({ floorNo: active ? "" : f })}
                    className={`min-h-[44px] rounded-xl border px-4 text-[14px] font-bold transition active:scale-95 ${
                      active ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-white"
                    }`}
                  >
                    {f}
                  </button>
                );
              })}
            </div>
          </div>
          <Field id="sp-size" label={wholeHome ? "About how large is it?" : "Room size (optional)"}>
            <div className="relative">
              <input
                id="sp-size"
                inputMode="numeric"
                placeholder="350"
                value={space.carpetArea}
                onChange={(e) =>
                  onSpace({ carpetArea: e.target.value.replace(/[^0-9]/g, "").slice(0, 5) })
                }
                className="min-h-[52px] w-full rounded-xl border border-line bg-white px-4 pr-16 text-[15px] placeholder:text-muted focus:border-brand-600 focus:outline-none"
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[14px] font-semibold text-muted">
                sq ft
              </span>
            </div>
          </Field>
        </div>
      </div>
      {error && (
        <div className="mt-4">
          <FormError message={error} />
        </div>
      )}
    </FormSection>
  );
}

/* ------------------------------------------------------------------ */
/* Chapter 6 — What's included?                                        */
/* ------------------------------------------------------------------ */

const AMENITY_GROUPS: { title: string; items: string[] }[] = [
  { title: "Room", items: ["Wi-Fi", "AC", "Attached bathroom", "Balcony"] },
  {
    title: "Property",
    items: ["Parking", "CCTV", "Security", "Power backup", "Laundry", "Housekeeping"],
  },
  { title: "Other", items: ["Food / mess", "Drinking water", "Kitchen access"] },
];

export function IncludedChapter({
  draft,
  onSpace,
  error,
}: {
  draft: { space: SpaceDraft };
  onSpace: (patch: Partial<SpaceDraft>) => void;
  error: string | null;
}) {
  const toggle = (name: string) => {
    const has = draft.space.amenities.includes(name);
    onSpace({
      amenities: has
        ? draft.space.amenities.filter((a) => a !== name)
        : [...draft.space.amenities, name],
    });
  };
  return (
    <FormSection
      id="chapter-included"
      kicker="What's included"
      title="What's included with the place?"
      lede="Tick what renters get — skip anything that doesn't apply."
    >
      <div className="space-y-4">
        {AMENITY_GROUPS.map((group) => (
          <div key={group.title}>
            <p className="mb-2 text-[12px] font-bold uppercase tracking-[0.12em] text-muted">
              {group.title}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {group.items.map((name) => {
                const active = draft.space.amenities.includes(name);
                return (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggle(name)}
                    className={`flex min-h-[56px] items-center gap-2 rounded-xl border px-3 text-left transition active:scale-[0.98] ${
                      active ? "border-brand-600 bg-brand-50" : "border-line bg-white"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition ${
                        active ? "border-brand-600 bg-brand-600 text-white" : "border-line text-transparent"
                      }`}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
                        <path d="m4.5 12.5 5 5 10-11" />
                      </svg>
                    </span>
                    <span className={`text-[13.5px] font-bold leading-tight ${active ? "text-brand-700" : ""}`}>
                      {name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {error && (
        <div className="mt-4">
          <FormError message={error} />
        </div>
      )}
    </FormSection>
  );
}

/* ------------------------------------------------------------------ */
/* Chapter 7 — Who can stay?                                           */
/* ------------------------------------------------------------------ */

const AUDIENCES = [
  { value: "Anyone", title: "Anyone", body: "Open to every renter" },
  { value: "Men", title: "Men", body: "Men only" },
  { value: "Women", title: "Women", body: "Women only" },
] as const;

export function WhoChapter({
  draft,
  onSpace,
  onPlace,
  error,
}: {
  draft: { space: SpaceDraft; place: PlaceDraft };
  onSpace: (patch: Partial<SpaceDraft>) => void;
  onPlace: (patch: Partial<PlaceDraft>) => void;
  error: string | null;
}) {
  const { space, place } = draft;
  const isPg = place.buildingType === "PG" || place.buildingType === "HOSTEL";
  return (
    <FormSection
      id="chapter-who"
      kicker="The people"
      title="Who can stay?"
      lede="Say what matters to you. Anything you skip simply stays unspecified."
    >
      <ChoiceGrid
        label="Who can stay"
        value={space.audience}
        onPick={(audience) => onSpace({ audience })}
        options={[...AUDIENCES]}
      />
      <div className="mt-5 space-y-2.5">
        {POLICY_ROWS.map((row) => (
          <ClearableChoice
            key={row.key}
            label={row.label}
            hint={row.hint}
            options={[
              { value: true, label: "Allowed" },
              { value: false, label: "Not allowed" },
            ]}
            value={space.policies[row.key]}
            clearValue={null}
            onPick={(v) =>
              onSpace({
                policies: { ...space.policies, [row.key]: v as boolean | null },
              })
            }
          />
        ))}
      </div>
      {isPg && (
        <div className="mt-5 rounded-2xl border border-line bg-white p-4">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-brand-700">
            PG / hostel details
          </p>
          <div className="mt-3">
            <ClearableChoice
              label="Is food provided?"
              options={[
                { value: "included", label: "Included in rent" },
                { value: "separate", label: "Available separately" },
                { value: "none", label: "No food" },
              ]}
              value={space.pgFood}
              clearValue=""
              onPick={(v) => onSpace({ pgFood: (v ?? "") as SpaceDraft["pgFood"] })}
            />
          </div>
          <div className="mt-2.5">
            <ClearableChoice
              label="Is there a curfew?"
              options={[
                { value: true, label: "Yes" },
                { value: false, label: "No" },
              ]}
              value={space.pgCurfew}
              clearValue={null}
              onPick={(v) => {
                const curfew = v as boolean | null;
                // No curfew means no gate time — never retain one.
                if (curfew === false) onPlace({ gateTime: "" });
                onSpace({ pgCurfew: curfew });
              }}
            />
          </div>
          {space.pgCurfew === true && (
            <div className="mt-2.5">
              <Field id="who-gate" label="What time does the gate close?">
                <TextField
                  id="who-gate"
                  type="time"
                  autoComplete="off"
                  placeholder=""
                  value={place.gateTime}
                  onChange={(v) => onPlace({ gateTime: v })}
                />
              </Field>
            </div>
          )}
        </div>
      )}
      <div className="mt-5">
        <label htmlFor="who-notes" className="mb-1.5 block text-[14px] font-bold">
          Anything else renters should know?
        </label>
        <textarea
          id="who-notes"
          rows={3}
          maxLength={2000}
          placeholder="Water timings, quiet hours…"
          value={space.houseRules}
          onChange={(e) => onSpace({ houseRules: e.target.value.slice(0, 2000) })}
          className="min-h-[96px] w-full rounded-xl border border-line bg-white px-4 py-3 text-[15px] placeholder:text-muted focus:border-brand-600 focus:outline-none"
        />
      </div>
      {error && (
        <div className="mt-4">
          <FormError message={error} />
        </div>
      )}
    </FormSection>
  );
}

/* ------------------------------------------------------------------ */
/* Chapter 8 — Show the place                                          */
/* ------------------------------------------------------------------ */

function newPhotoId(): string {
  return `photo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Downscale to a JPEG data URL so previews persist inside localStorage
 * limits. No binary blobs are stored. Dimensions ride along for the
 * upload confirm call.
 */
function fileToPreview(
  file: File
): Promise<{ src: string | null; width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const maxSide = 1200;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve({ src: null, width: img.width, height: img.height });
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve({
          src: canvas.toDataURL("image/jpeg", 0.82),
          width: img.width,
          height: img.height,
        });
      } catch {
        resolve({ src: null, width: null, height: null });
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ src: null, width: null, height: null });
    };
    img.src = url;
  });
}

/** Backend photo operations, injectable for tests. */
export interface PhotoBackendOps {
  upload: (
    listingId: number,
    file: File,
    mime: AcceptedMime,
    opts: {
      displayOrder: number;
      isCover: boolean;
      width?: number | null;
      height?: number | null;
    }
  ) => Promise<OwnerPhotoItem>;
  remove: (listingId: number, photoId: number) => Promise<void>;
  patch: (
    listingId: number,
    photoId: number,
    patch: { display_order?: number | null; is_cover?: boolean | null }
  ) => Promise<OwnerPhotoItem>;
  refresh: (listingId: number) => Promise<OwnerPhotoItem[]>;
}

const defaultPhotoOps: PhotoBackendOps = {
  upload: (listingId, file, mime, opts) =>
    uploadPhoto(listingId, file, mime, opts),
  remove: async (listingId, photoId) => {
    await deleteListingPhoto(listingId, photoId);
  },
  patch: (listingId, photoId, patch) =>
    patchListingPhoto(listingId, photoId, patch),
  refresh: async (listingId) => (await getOwnerListing(listingId)).photos,
};

/**
 * Merge backend READY photos into draft tiles by backend id: refreshes
 * view URLs (they expire) and adopts backend rows missing locally (e.g.
 * after a reload). Local order/cover choices are never overwritten here;
 * returns null when nothing changed so callers avoid render loops.
 */
export function mergeBackendPhotos(
  prev: PhotoDraft[],
  backend: OwnerPhotoItem[]
): PhotoDraft[] | null {
  let changed = false;
  const next = prev.map((p) => {
    if (p.backendId == null) return p;
    const row = backend.find((b) => b.id === p.backendId);
    if (!row || row.upload_status !== "READY") return p;
    if (p.status === "ready" && p.viewUrl === (row.view_url ?? null)) return p;
    changed = true;
    return {
      ...p,
      status: "ready" as const,
      viewUrl: row.view_url ?? null,
      error: null,
    };
  });
  for (const row of backend) {
    if (row.upload_status !== "READY") continue;
    if (next.some((p) => p.backendId === row.id)) continue;
    changed = true;
    next.push({
      id: `backend-${row.id}`,
      name: "Photo",
      src: null,
      status: "ready",
      cover: false,
      order: next.length,
      backendId: row.id,
      viewUrl: row.view_url ?? null,
      error: null,
    });
  }
  if (!changed) return null;
  if (next.length > 0 && !next.some((p) => p.cover))
    next[0] = { ...next[0], cover: true };
  return next.map((p, i) => ({ ...p, order: i }));
}

export function PhotosChapter({
  photos,
  onPhotos,
  error,
  listingId,
  onEnsureListing,
  photoOps,
  fileStore,
}: {
  photos: PhotoDraft[];
  onPhotos: (photos: PhotoDraft[]) => void;
  error: string | null;
  /** Backend listing id; null until the submit flow creates it. */
  listingId: number | null;
  /** Creates the backend DRAFT listing; failures carry the real reason. */
  onEnsureListing: () => Promise<
    { ok: true; listingId: number } | { ok: false; message: string }
  >;
  photoOps?: PhotoBackendOps;
  /** Session-only original files, shared so send can finish uploads. */
  fileStore: Map<string, File>;
}) {
  const ops = photoOps ?? defaultPhotoOps;
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const refreshedForRef = useRef<number | null>(null);
  const ordered = [...photos].sort((a, b) => a.order - b.order);
  const readyCount = ordered.filter((p) => p.status === "ready").length;

  // Synchronous mirror of the tiles: React state updates (and therefore
  // re-renders) are async, but upload callbacks chain several tile updates
  // in one tick — the mirror keeps every step composable. Re-synced from
  // props on each render; onPhotos stays the single parent write path.
  const tilesRef = useRef(ordered);
  tilesRef.current = ordered;
  const setTiles = (tiles: PhotoDraft[]) => {
    const fixed =
      tiles.length > 0 && !tiles.some((p) => p.cover)
        ? tiles.map((p, i) => (i === 0 ? { ...p, cover: true } : p))
        : tiles;
    const next = fixed.map((p, i) => ({ ...p, order: i }));
    tilesRef.current = next;
    onPhotos(next);
  };

  const updateTiles = (fn: (prev: PhotoDraft[]) => PhotoDraft[]) =>
    setTiles(fn([...tilesRef.current]));

  // Refresh view URLs + adopt backend rows once per listing id, and
  // whenever a ready tile is missing its view URL.
  useEffect(() => {
    if (listingId == null) return;
    const missingView = ordered.some(
      (p) => p.status === "ready" && p.backendId != null && !p.viewUrl
    );
    if (refreshedForRef.current === listingId && !missingView) return;
    let cancelled = false;
    void ops
      .refresh(listingId)
      .then((rows) => {
        if (cancelled) return;
        refreshedForRef.current = listingId;
        updateTiles((prev) => {
          const merged = mergeBackendPhotos(
            [...prev].sort((a, b) => a.order - b.order),
            rows
          );
          return merged ?? prev;
        });
      })
      .catch(() => {
        // View URLs are a display nicety; uploads still work.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId]);

  const runUpload = async (
    tileId: string,
    file: File,
    mime: AcceptedMime,
    dims: { width: number | null; height: number | null },
    targetListingId: number,
    displayOrder: number,
    isCover: boolean
  ) => {
    updateTiles((prev) =>
      prev.map((p) =>
        p.id === tileId
          ? { ...p, status: "uploading" as const, error: null }
          : p
      )
    );
    try {
      const row = await ops.upload(targetListingId, file, mime, {
        displayOrder,
        isCover,
        width: dims.width,
        height: dims.height,
      });
      fileStore?.delete(tileId);
      updateTiles((prev) =>
        prev.map((p) =>
          p.id === tileId
            ? {
                ...p,
                status: "ready" as const,
                backendId: row.id,
                viewUrl: row.view_url ?? null,
                error: null,
              }
            : p
        )
      );
    } catch (err) {
      updateTiles((prev) =>
        prev.map((p) =>
          p.id === tileId
            ? {
                ...p,
                status: "failed" as const,
                error:
                  err instanceof Error ? err.message : "Upload failed — retry.",
              }
            : p
        )
      );
    }
  };

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const room = 15 - ordered.length;
    if (room <= 0) {
      setLocalError("15 photos is the maximum — remove one to add another.");
      return;
    }
    setBusy(true);
    setLocalError(null);
    try {
      const picked: { file: File; mime: AcceptedMime }[] = [];
      for (const file of [...files].slice(0, room)) {
        const problem = validatePhotoFile(file);
        if (problem) {
          setLocalError(problem);
          continue;
        }
        const mime = resolveMime(file);
        if (mime) picked.push({ file, mime });
      }
      if (picked.length === 0) return;
      // Backend listing first (existing submit flow); without it uploads
      // stay local picks and sync on the next attempt.
      let targetListingId = listingId;
      if (targetListingId == null) {
        const ensured = await onEnsureListing();
        if (!ensured.ok) {
          setLocalError(ensured.message);
        } else {
          targetListingId = ensured.listingId;
        }
      }
      const base = [...ordered];
      const jobs: (() => Promise<void>)[] = [];
      for (const { file, mime } of picked) {
        const preview = await fileToPreview(file);
        const tile: PhotoDraft = {
          id: newPhotoId(),
          name: file.name || "Photo",
          src: preview.src,
          status: "local",
          cover: base.length === 0,
          order: base.length,
          backendId: null,
          viewUrl: null,
          error: null,
        };
        base.push(tile);
        fileStore?.set(tile.id, file);
        if (targetListingId != null) {
          const tileId = tile.id;
          const displayOrder = tile.order;
          const isCover = tile.cover;
          jobs.push(() =>
            runUpload(
              tileId,
              file,
              mime,
              { width: preview.width, height: preview.height },
              targetListingId as number,
              displayOrder,
              isCover
            )
          );
        }
      }
      setTiles(base);
      for (const job of jobs) await job();
    } finally {
      setBusy(false);
    }
  };

  const retryUpload = async (id: string) => {
    const tile = ordered.find((p) => p.id === id);
    const file = fileStore?.get(id);
    if (!tile || !file) {
      setLocalError("The original file is gone — please re-select it.");
      return;
    }
    const mime = resolveMime(file);
    if (!mime) {
      setLocalError("Those files aren't photos — try JPG, PNG or WebP.");
      return;
    }
    let targetListingId = listingId;
    if (targetListingId == null) {
      const ensured = await onEnsureListing();
      if (!ensured.ok) {
        setLocalError(ensured.message);
        return;
      }
      targetListingId = ensured.listingId;
    }
    setBusy(true);
    try {
      await runUpload(
        id,
        file,
        mime,
        { width: null, height: null },
        targetListingId,
        tile.order,
        tile.cover
      );
    } finally {
      setBusy(false);
    }
  };

  const removePhoto = async (id: string) => {
    const tile = ordered.find((p) => p.id === id);
    if (tile?.backendId != null && listingId != null) {
      setBusy(true);
      try {
        await ops.remove(listingId, tile.backendId);
      } catch {
        setLocalError("Couldn't delete that photo — try again.");
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    fileStore?.delete(id);
    setTiles(ordered.filter((p) => p.id !== id));
  };

  const persistOrderAndCover = async (tiles: PhotoDraft[]) => {
    if (listingId == null) return;
    const backendTiles = tiles.filter((p) => p.backendId != null);
    if (backendTiles.length === 0) return;
    try {
      await Promise.all(
        backendTiles.map((p, i) =>
          ops.patch(listingId, p.backendId as number, {
            display_order: i,
            is_cover: p.cover,
          })
        )
      );
    } catch {
      setLocalError("Order saved here — Apun-Ghar will catch up on retry.");
    }
  };

  const movePhoto = (id: string, dir: -1 | 1) => {
    const arr = [...ordered];
    const i = arr.findIndex((p) => p.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    const [item] = arr.splice(i, 1);
    arr.splice(j, 0, item);
    const next = arr.map((p, k) => ({ ...p, order: k }));
    setTiles(next);
    void persistOrderAndCover(next);
  };

  const makeCover = (id: string) => {
    const next = ordered.map((p) => ({ ...p, cover: p.id === id }));
    setTiles(next);
    void persistOrderAndCover(next);
  };

  return (
    <FormSection
      id="chapter-photos"
      kicker="Show the place"
      title="Show people the place"
      lede="Good photos help renters understand the space before they visit. Bright rooms, real angles — no filters needed."
    >
      <div className="flex items-center justify-between rounded-2xl bg-brand-50 px-4 py-3">
        <span className="text-[14px] font-bold text-brand-700">
          {readyCount} of 3 required photos ready
        </span>
        <span className="text-[13px] font-semibold text-brand-700">{ordered.length}/15</span>
      </div>
      {readyCount < 3 && (
        <p className="mt-2 rounded-xl bg-cream px-3.5 py-2.5 text-[13px] font-medium text-muted">
          You&apos;ll need 3 ready photos before publishing — uploads finish
          here automatically once Apun-Ghar confirms them.
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {ordered.map((p, i) => (
          <div key={p.id} className="relative overflow-hidden rounded-2xl border border-line bg-white">
            {(p.viewUrl ?? p.src) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={(p.viewUrl ?? p.src) as string} alt={`Listing photo ${i + 1}`} className="aspect-[4/3] w-full object-cover" />
            ) : (
              <span className="flex aspect-[4/3] w-full items-center justify-center bg-cream text-[13px] font-semibold text-muted">
                Photo {i + 1}
              </span>
            )}
            {p.cover && (
              <span className="absolute left-2 top-2 rounded-full bg-brand-600 px-2.5 py-1 text-[11px] font-bold text-white">
                Cover
              </span>
            )}
            {p.status === "uploading" && (
              <span className="absolute right-2 top-2 rounded-full bg-ink/70 px-2.5 py-1 text-[11px] font-bold text-white">
                Uploading…
              </span>
            )}
            {p.status === "ready" && (
              <span className="absolute right-2 top-2 rounded-full bg-[#2F7D4F] px-2.5 py-1 text-[11px] font-bold text-white">
                Ready ✓
              </span>
            )}
            {p.status === "failed" && (
              <button
                type="button"
                onClick={() => void retryUpload(p.id)}
                className="absolute right-2 top-2 rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-bold text-white"
              >
                Failed — retry
              </button>
            )}
            <div className="flex items-center justify-between gap-1 p-1.5">
              <div className="flex gap-1">
                <button type="button" onClick={() => movePhoto(p.id, -1)} aria-label={`Move photo ${i + 1} earlier`}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-cream transition active:scale-95">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M14.5 5 7.5 12l7 7" />
                  </svg>
                </button>
                <button type="button" onClick={() => movePhoto(p.id, 1)} aria-label={`Move photo ${i + 1} later`}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-cream transition active:scale-95">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m9 5 7 7-7 7" />
                  </svg>
                </button>
              </div>
              <div className="flex gap-1">
                {!p.cover && (
                  <button type="button"
                    onClick={() => makeCover(p.id)}
                    aria-label={`Make photo ${i + 1} the cover`}
                    className="flex h-10 items-center rounded-xl bg-cream px-2.5 text-[12.5px] font-bold text-brand-700 transition active:scale-95">
                    Cover
                  </button>
                )}
                <button type="button" onClick={() => void removePhoto(p.id)} aria-label={`Remove photo ${i + 1}`}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-cream text-muted transition active:scale-95">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden>
                    <path d="m6 6 12 12M18 6 6 18" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        ))}
        {ordered.length < 15 && (
          <label
            className={`flex min-h-[190px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-white/60 transition active:scale-[0.99] ${
              busy ? "pointer-events-none opacity-60" : "text-muted"
            }`}
          >
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              multiple
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <span aria-hidden className="text-[26px] font-bold leading-none">+</span>
            <span className="text-[14px] font-bold">{busy ? "Adding…" : "Add photos"}</span>
            <span className="px-3 text-center text-[12px]">JPG, PNG or WebP · 5 MB max · uploads to Apun-Ghar</span>
          </label>
        )}
      </div>
      {ordered.length >= 15 && (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-[13.5px] font-medium text-red-700">
          15 photos is the maximum — remove one to add another.
        </p>
      )}
      {(localError ?? error) && (
        <div className="mt-3">
          <FormError message={(localError ?? error) as string} />
        </div>
      )}
    </FormSection>
  );
}

/* ------------------------------------------------------------------ */
/* Chapter 9 — How much?                                               */
/* ------------------------------------------------------------------ */

function newExtraId(): string {
  return `extra-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function RupeeInput({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[14px] font-bold">
        {label}
      </label>
      <div className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[16px] font-bold text-muted"
        >
          ₹
        </span>
        <input
          id={id}
          inputMode="decimal"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, "").slice(0, 8))}
          className="min-h-[56px] w-full rounded-xl border border-line bg-white pl-9 pr-4 text-[18px] font-bold placeholder:font-normal placeholder:text-muted focus:border-brand-600 focus:outline-none"
        />
      </div>
    </div>
  );
}

export function PriceChapter({
  pricing,
  spaceKind,
  onPricing,
  error,
}: {
  pricing: PricingDraft;
  /** Rental kind drives the rent-basis default (whole-home → place). */
  spaceKind: SpaceDraft["kind"];
  onPricing: (pricing: PricingDraft) => void;
  error: string | null;
}) {
  const set = (patch: Partial<PricingDraft>) => onPricing({ ...pricing, ...patch });
  const fixedBasis = isWholeHomeKind(spaceKind);
  // Whole-home rent is always for the place; rooms default to per person
  // (the owner can switch to per room below).
  const derivedBasis = fixedBasis ? "place" : "person";
  const basis: PricingDraft["rentBasis"] =
    pricing.rentBasis || (spaceKind ? derivedBasis : "");

  // Persist the derived default once a kind is known, so later chapters
  // and the eventual submit mapping always see an explicit value.
  useEffect(() => {
    if (spaceKind && !pricing.rentBasis) set({ rentBasis: derivedBasis });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceKind]);

  const addExtra = (kind: ExtraKind) =>
    set({
      extras: [
        ...pricing.extras,
        {
          id: newExtraId(),
          kind,
          label: "",
          amount: "",
          frequency: kind === "electricity" ? "metered" : "monthly",
          metered: kind === "electricity",
          rate: "",
          mandatory: true,
          included: kind !== "electricity",
        },
      ],
    });

  const patchExtra = (id: string, patch: Partial<ExtraChargeDraft>) =>
    set({
      extras: pricing.extras.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    });

  const monthlyIncluded = (row: ExtraChargeDraft) =>
    !row.metered && row.frequency === "monthly" && row.included;
  const headline =
    (parseRupees(pricing.rent) ?? 0) +
    pricing.extras
      .filter(monthlyIncluded)
      .reduce((sum, row) => sum + (parseRupees(row.amount) ?? 0), 0);
  const extrasTotal = pricing.extras
    .filter((row) => !row.metered && row.frequency === "monthly" && !row.included)
    .reduce((sum, row) => sum + (parseRupees(row.amount) ?? 0), 0);
  const meteredCount = pricing.extras.filter((row) => row.metered).length;
  const deposit = parseRupees(pricing.deposit) ?? 0;

  return (
    <FormSection
      id="chapter-price"
      kicker="The money part"
      title="How much is the rent?"
      lede="Start with the rent. Everything else is optional — and always shown plainly."
    >
      <RupeeInput
        id="price-rent"
        label="Monthly rent"
        placeholder="8,000"
        value={pricing.rent}
        onChange={(rent) => set({ rent })}
      />

      {!fixedBasis ? (
        <div className="mt-4" role="radiogroup" aria-label="How is this rent charged">
          <p className="mb-1.5 text-[14px] font-bold">How is this rent charged?</p>
          <div className="grid grid-cols-2 gap-2">
            {(["person", "room"] as const).map((b) => {
              const active = (basis || "person") === b;
              return (
                <button
                  key={b}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => set({ rentBasis: b })}
                  className={`min-h-[52px] rounded-[14px] border text-[14.5px] font-bold transition active:scale-[0.98] ${
                    active ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line bg-white"
                  }`}
                >
                  {b === "person" ? "Per person" : "Per room"}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="mt-2 text-[13.5px] text-muted">
          Per month, for the whole place — no per-person maths needed.
        </p>
      )}

      <div className="mt-4 rounded-2xl border border-line bg-white p-4">
        <p className="text-[14.5px] font-bold">Security deposit</p>
        <p className="mt-0.5 text-[13px] text-muted">
          One-time and refundable — this is not monthly rent.
        </p>
        <div className="mt-2.5">
          <RupeeInput
            id="price-deposit"
            label="Deposit amount (optional)"
            placeholder="10,000"
            value={pricing.deposit}
            onChange={(deposit) => set({ deposit })}
          />
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-1.5 text-[14px] font-bold">
          Does the renter pay anything else? <span className="font-normal text-muted">(optional)</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {EXTRA_KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              onClick={() => addExtra(k.value)}
              className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-line bg-white px-3.5 text-[14px] font-semibold transition active:scale-[0.97]"
            >
              <span aria-hidden className="text-[16px] font-bold leading-none text-brand-700">+</span>
              {k.title}
            </button>
          ))}
        </div>

        {pricing.extras.map((row) => (
          <div key={row.id} className="mt-2.5 space-y-2.5 rounded-2xl border border-line bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[14.5px] font-bold">
                {row.kind === "other" ? "Custom charge" : EXTRA_KINDS.find((k) => k.value === row.kind)?.title}
              </p>
              <button
                type="button"
                onClick={() => set({ extras: pricing.extras.filter((r) => r.id !== row.id) })}
                aria-label="Remove charge"
                className="flex h-10 w-10 items-center justify-center rounded-lg text-muted transition active:scale-95"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden>
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            {row.kind === "other" && (
              <div>
                <label htmlFor={`extra-label-${row.id}`} className="mb-1 block text-[13px] font-semibold">
                  Name this charge
                </label>
                <input
                  id={`extra-label-${row.id}`}
                  value={row.label}
                  maxLength={60}
                  placeholder="e.g. Cleaning"
                  onChange={(e) => patchExtra(row.id, { label: e.target.value.slice(0, 60) })}
                  className="min-h-[52px] w-full rounded-xl border border-line bg-white px-4 text-[15px] placeholder:text-muted focus:border-brand-600 focus:outline-none"
                />
              </div>
            )}
            {row.metered ? (
              <RupeeInput
                id={`extra-rate-${row.id}`}
                label="Rate per unit (₹)"
                placeholder="8"
                value={row.rate}
                onChange={(rate) => patchExtra(row.id, { rate })}
              />
            ) : (
              <RupeeInput
                id={`extra-amt-${row.id}`}
                label="Amount (₹)"
                placeholder="500"
                value={row.amount}
                onChange={(amount) => patchExtra(row.id, { amount })}
              />
            )}
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="How often">
              {EXTRA_FREQUENCIES.map((f) => {
                const active = row.frequency === f.value;
                return (
                  <button
                    key={f.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() =>
                      patchExtra(row.id, {
                        frequency: f.value,
                        metered: f.value === "metered",
                      })
                    }
                    className={`min-h-[44px] flex-1 basis-[30%] rounded-xl border px-2 text-[13px] font-bold transition active:scale-[0.97] ${
                      active ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-white"
                    }`}
                  >
                    {f.title}
                  </button>
                );
              })}
            </div>
            {row.metered && (
              <p className="text-[12.5px] text-muted">
                Billed on actual usage — the per-unit rate above, settled separately.
              </p>
            )}
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                aria-pressed={row.mandatory}
                onClick={() => patchExtra(row.id, { mandatory: !row.mandatory })}
                className={`min-h-[44px] rounded-xl border px-3.5 text-[13px] font-bold transition active:scale-[0.97] ${
                  row.mandatory ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line bg-white"
                }`}
              >
                {row.mandatory ? "Everyone pays" : "Optional add-on"}
              </button>
              <button
                type="button"
                aria-pressed={row.included}
                onClick={() => patchExtra(row.id, { included: !row.included })}
                className={`min-h-[44px] rounded-xl border px-3.5 text-[13px] font-bold transition active:scale-[0.97] ${
                  row.included ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line bg-white"
                }`}
              >
                {row.included ? "In headline price" : "Shown as extra"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-2xl bg-ink p-5 text-white">
        <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-white/60">
          What the renter will pay
        </p>
        <p className="mt-1 text-[30px] font-bold">
          {headline > 0 ? inr(headline) : "—"}
          <span className="text-[15px] font-semibold text-white/70"> / month</span>
        </p>
        {extrasTotal > 0 && (
          <p className="mt-1 text-[13.5px] text-white/75">+ {inr(extrasTotal)} extras</p>
        )}
        {meteredCount > 0 && (
          <p className="mt-0.5 text-[13.5px] text-white/75">+ pay-as-used charges billed separately</p>
        )}
        {deposit > 0 && (
          <p className="mt-2 border-t border-white/15 pt-2 text-[13.5px] text-white/85">
            Security deposit · {inr(deposit)} refundable
          </p>
        )}
      </div>
      {error && (
        <div className="mt-3">
          <FormError message={error} />
        </div>
      )}
    </FormSection>
  );
}

/* ------------------------------------------------------------------ */
/* Chapter 10 — When can someone move in?                               */
/* ------------------------------------------------------------------ */

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function MoveInChapter({
  availability,
  onAvailability,
  error,
}: {
  availability: AvailabilityDraft;
  onAvailability: (availability: AvailabilityDraft) => void;
  error: string | null;
}) {
  const set = (patch: Partial<AvailabilityDraft>) =>
    onAvailability({ ...availability, ...patch });
  const cards = [
    { mode: "now" as const, title: "Ready now", body: "A renter could move in this week." },
    { mode: "from" as const, title: "Available from…", body: "Name the first move-in date." },
    { mode: "occupied" as const, title: "Currently full", body: "Someone's staying right now." },
  ];
  return (
    <FormSection
      id="chapter-movein"
      kicker="Timing"
      title="When can someone move in?"
      lede="Be honest here — it sets the right expectation from the very first message."
    >
      <div className="space-y-2.5" role="radiogroup" aria-label="Move-in timing">
        {cards.map((c) => {
          const active = availability.mode === c.mode;
          return (
            <div key={c.mode}>
              <button
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => set({ mode: c.mode })}
                className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition active:scale-[0.99] ${
                  active ? "border-brand-600 bg-brand-50" : "border-line bg-white"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-bold">{c.title}</span>
                  <span className="block text-[13.5px] text-muted">{c.body}</span>
                </span>
                <span
                  aria-hidden
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                    active ? "border-brand-600" : "border-line"
                  }`}
                >
                  {active && <span className="h-3 w-3 rounded-full bg-brand-600" />}
                </span>
              </button>
              {c.mode === "from" && active && (
                <div className="mt-2 pl-1">
                  <label htmlFor="mv-date" className="mb-1 block text-[13.5px] font-bold">
                    First move-in date
                  </label>
                  <input
                    id="mv-date"
                    type="date"
                    min={todayISO()}
                    value={availability.date}
                    onChange={(e) => set({ date: e.target.value })}
                    className="min-h-[52px] w-full rounded-[14px] border border-line bg-white px-4 text-[15px] focus:border-brand-600 focus:outline-none sm:max-w-[240px]"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {availability.mode === "occupied" && (
        <p className="mt-3 rounded-xl bg-cream px-3.5 py-2.5 text-[13px] font-medium text-muted">
          Your listing stays private while the space is full. You can still finish everything else.
        </p>
      )}
      {error && (
        <div className="mt-3">
          <FormError message={error} />
        </div>
      )}
    </FormSection>
  );
}

/* ------------------------------------------------------------------ */
/* Chapter 11 — Name your listing                                      */
/* ------------------------------------------------------------------ */

export function NameChapter({
  listing,
  suggestion,
  onListing,
  error,
}: {
  listing: ListingIdentityDraft;
  /** Owner-editable suggestion built from earlier answers (never stored silently). */
  suggestion: string;
  onListing: (listing: ListingIdentityDraft) => void;
  error: string | null;
}) {
  const showSuggestion =
    suggestion.length >= 2 &&
    listing.title.trim().toLowerCase() !== suggestion.toLowerCase();
  return (
    <FormSection
      id="chapter-name"
      kicker="The finishing touch"
      title="Give your place a name"
      lede="No need to be clever — clear beats catchy. Start from our suggestion and make it yours."
    >
      {showSuggestion && (
        <button
          type="button"
          onClick={() => onListing({ ...listing, title: suggestion })}
          className="mb-3 w-full rounded-2xl border border-dashed border-brand-600 bg-brand-50 p-4 text-left transition active:scale-[0.99]"
        >
          <span className="block text-[12px] font-bold uppercase tracking-[0.12em] text-brand-700">
            Suggested for you — tap to use
          </span>
          <span className="mt-1 block text-[16px] font-bold">{suggestion}</span>
        </button>
      )}
      <div>
        <label htmlFor="nm-title" className="mb-1.5 block text-[14px] font-bold">
          Title
        </label>
        <input
          id="nm-title"
          value={listing.title}
          maxLength={200}
          placeholder="e.g. Sunny 2 BHK near Six Mile"
          onChange={(e) => onListing({ ...listing, title: e.target.value.slice(0, 200) })}
          className="min-h-[52px] w-full rounded-xl border border-line bg-white px-4 text-[15px] placeholder:text-muted focus:border-brand-600 focus:outline-none"
        />
        <span className="mt-1 block text-right text-[12px] text-muted">
          {listing.title.trim().length}/200
        </span>
      </div>
      <div className="mt-4">
        <label htmlFor="nm-desc" className="mb-1.5 block text-[14px] font-bold">
          Tell renters a little more <span className="font-normal text-muted">(optional)</span>
        </label>
        <textarea
          id="nm-desc"
          rows={4}
          placeholder="What's nearby? What's included? Anything about food, timings, parking or the neighbourhood?"
          value={listing.description}
          onChange={(e) => onListing({ ...listing, description: e.target.value })}
          className="min-h-[112px] w-full rounded-[14px] border border-line bg-white px-4 py-3 text-[15px] placeholder:text-muted focus:border-brand-600 focus:outline-none"
        />
        <p className="mt-1.5 text-[12.5px] text-muted">
          Three honest lines beat a formal brochure. Write like you&apos;d tell a neighbour.
        </p>
      </div>
      {error && (
        <div className="mt-3">
          <FormError message={error} />
        </div>
      )}
    </FormSection>
  );
}

/* ------------------------------------------------------------------ */
/* Chapter 12 — Preview (renter-facing; omits everything unspecified)  */
/* ------------------------------------------------------------------ */

const BHK_DISPLAY: Record<string, string> = {
  rk1: "1 RK",
  bhk1: "1 BHK",
  bhk2: "2 BHK",
  bhk3: "3 BHK",
  bhk4plus: "4 BHK+",
};

const FREQUENCY_LABEL: Record<ExtraChargeDraft["frequency"], string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
  once: "One-time",
  metered: "As used",
};

function PreviewEdit({ onGo }: { onGo: () => void }) {
  return (
    <button
      type="button"
      onClick={onGo}
      className="shrink-0 rounded-lg bg-brand-50 px-3 py-1.5 text-[13px] font-bold text-brand-700 transition active:scale-95"
    >
      Edit
    </button>
  );
}

export function PreviewChapter({
  draft,
  go,
}: {
  draft: ListingDraft;
  go: (step: ChapterId) => void;
}) {
  const { space, place, pricing } = draft;
  const [photoIdx, setPhotoIdx] = useState(0);
  const gallery = [...draft.photos].sort((a, b) => {
    const aCover = a.id === effectiveCoverId(draft) ? 0 : 1;
    const bCover = b.id === effectiveCoverId(draft) ? 0 : 1;
    return aCover - bCover || a.order - b.order;
  });

  const kindTitle =
    RENTAL_KINDS.find((k) => k.value === space.kind)?.title ?? "";
  const layoutLabel = BHK_DISPLAY[space.kind] ?? "";
  const buildingTitle =
    BUILDING_KINDS.find((b) => b.value === place.buildingType)?.title ?? "";
  const locationLine = [
    place.locality,
    place.area?.name,
    place.areaCustomName,
    place.city,
  ]
    .map((s) => s?.trim() ?? "")
    .filter(Boolean)
    .join(", ");
  const nearby = [
    place.college?.name.trim() ? `Near ${place.college.name.trim()}` : "",
    place.workplace?.name.trim() ? `Near ${place.workplace.name.trim()}` : "",
  ].filter(Boolean);

  const fact = (k: string, v: string) => (
    <div key={k} className="rounded-xl bg-paper px-3 py-2.5">
      <p className="text-[12px] text-muted">{k}</p>
      <p className="text-[14px] font-bold">{v}</p>
    </div>
  );

  const basisSuffix =
    pricing.rentBasis === "room"
      ? " / room"
      : pricing.rentBasis === "place"
        ? " for the whole place"
        : " / person";
  const rentAmount = parseRupees(pricing.rent);
  const depositAmount = parseRupees(pricing.deposit);
  const monthlyRows = pricing.extras.filter((r) => !r.metered);
  const meteredRows = pricing.extras.filter((r) => r.metered);
  // Renter-facing headline mirrors the approved prototype: rent plus
  // monthly included charges; monthly non-included charges are extras;
  // metered rows are billed separately and never folded into the total.
  const headlineTotal =
    (rentAmount ?? 0) +
    pricing.extras
      .filter((r) => !r.metered && r.frequency === "monthly" && r.included)
      .reduce((sum, r) => sum + (parseRupees(r.amount) ?? 0), 0);
  const extrasTotal = pricing.extras
    .filter((r) => !r.metered && r.frequency === "monthly" && !r.included)
    .reduce((sum, r) => sum + (parseRupees(r.amount) ?? 0), 0);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-brand-700">
          Preview
        </p>
        <h2 className="mt-1.5 text-[24px] font-bold leading-[1.15] tracking-tight lg:text-[28px]">
          This is what renters will see
        </h2>
        <p className="mt-2 max-w-xl text-[14.5px] leading-relaxed text-muted">
          Read it like a renter. Anything missing or off — fix it before publishing.
        </p>
      </div>

      <section aria-label="Listing preview" className="overflow-hidden rounded-2xl border border-line bg-white">
        <div className="relative">
          {gallery.length > 0 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={gallery[Math.min(photoIdx, gallery.length - 1)].viewUrl ?? gallery[Math.min(photoIdx, gallery.length - 1)].src ?? ""}
              alt={draft.listing.title.trim() || "Listing photo"}
              className="aspect-[4/3] w-full object-cover"
            />
          ) : (
            <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 bg-cream text-muted">
              <p className="text-[14px] font-semibold">No photos yet</p>
              <button
                type="button"
                onClick={() => go("photos")}
                className="rounded-lg bg-white px-3 py-1.5 text-[13px] font-bold text-brand-700 shadow-sm"
              >
                Add photos
              </button>
            </div>
          )}
          {gallery.length > 1 && (
            <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
              {gallery.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPhotoIdx(i)}
                  aria-label={`Photo ${i + 1}`}
                  className={`h-1.5 rounded-full transition ${i === Math.min(photoIdx, gallery.length - 1) ? "w-6 bg-white" : "w-1.5 bg-white/60"}`}
                />
              ))}
            </div>
          )}
        </div>
        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-[19px] font-bold tracking-tight">
                {draft.listing.title.trim() || "Your headline"}
              </h3>
              <p className="mt-0.5 text-[14px] text-muted">{locationLine || "Locality, City"}</p>
              {nearby.length > 0 && (
                <p className="mt-0.5 text-[13px] text-muted">{nearby.join(" · ")}</p>
              )}
            </div>
            <PreviewEdit onGo={() => go("name")} />
          </div>
        </div>
      </section>

      <section aria-label="Key facts" className="rounded-2xl border border-line bg-white p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-bold">The essentials</h3>
          <PreviewEdit onGo={() => go("space")} />
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          {kindTitle ? fact("Space", layoutLabel || kindTitle + (space.kind === "shared" && space.beds ? ` · ${space.beds === 5 ? "5+" : space.beds} beds` : "")) : fact("Space", "—")}
          {fact("Building", place.buildingOther.trim() || buildingTitle || "—")}
          {fact("For", space.audience || "Anyone")}
          {fact("Furnishing", space.furnishing || "—")}
          {(space.bathrooms || space.floorNo || space.carpetArea) &&
            fact(
              "Details",
              [space.bathrooms && `${space.bathrooms} bath${space.bathrooms === "1" ? "" : "s"}`, space.floorNo && space.floorNo !== "Don't know" ? `${space.floorNo} floor` : "", space.carpetArea ? `${space.carpetArea} sq ft` : ""]
                .filter(Boolean)
                .join(" · ")
            )}
        </div>
      </section>

      <section aria-label="Price" className="rounded-2xl border border-line bg-white p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-bold">Price breakdown</h3>
          <PreviewEdit onGo={() => go("price")} />
        </div>
        <div className="mt-2.5 space-y-2 text-[14px]">
          <div className="flex items-center justify-between">
            <span className="text-muted">Monthly rent{basisSuffix}</span>
            <span className="font-medium">{rentAmount !== null ? inr(rentAmount) : "—"}</span>
          </div>
          {monthlyRows.map((r) => (
            <div key={r.id} className="flex items-center justify-between">
              <span className="text-muted">
                {(r.kind === "other" ? r.label.trim() || "Other" : (EXTRA_KINDS.find((k) => k.value === r.kind)?.title ?? r.kind)) +
                  (r.frequency === "monthly" ? "" : ` · ${FREQUENCY_LABEL[r.frequency]}`) +
                  (r.included ? "" : " (extra)")}
              </span>
              <span className="font-medium">
                {parseRupees(r.amount) !== null ? inr(parseRupees(r.amount) as number) : "—"}
              </span>
            </div>
          ))}
          {meteredRows.map((r) => (
            <div key={r.id} className="flex items-center justify-between">
              <span className="text-muted">
                {(r.kind === "other" ? r.label.trim() || "Other" : (EXTRA_KINDS.find((k) => k.value === r.kind)?.title ?? r.kind))} · as used
              </span>
              <span className="font-medium">
                {parseRupees(r.rate) !== null ? `${inr(parseRupees(r.rate) as number)} / unit` : "—"}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between rounded-xl bg-brand-50 px-3 py-2.5">
          <span className="text-[14px] font-semibold text-brand-700">Estimated monthly cost</span>
          <span className="text-[17px] font-bold text-brand-700">
            {headlineTotal + extrasTotal > 0 ? inr(headlineTotal + extrasTotal) : "—"}
          </span>
        </div>
        {extrasTotal > 0 && (
          <p className="mt-1 text-[13.5px] text-muted">+ {inr(extrasTotal)} extras</p>
        )}
        {meteredRows.length > 0 && (
          <p className="mt-0.5 text-[13.5px] text-muted">+ pay-as-used charges billed separately</p>
        )}
        {depositAmount !== null && (
          <div className="mt-2.5 flex items-center justify-between text-[14px]">
            <span className="text-muted">Refundable deposit (one-time)</span>
            <span className="font-semibold">{inr(depositAmount)}</span>
          </div>
        )}
      </section>

      {(space.amenities.length > 0 ||
        draft.listing.description ||
        space.houseRules ||
        space.independent !== null ||
        space.pgFood !== "") && (
        <section aria-label="Amenities and rules" className="rounded-2xl border border-line bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-bold">Amenities & rules</h3>
            <PreviewEdit onGo={() => go("included")} />
          </div>
          {space.amenities.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {space.amenities.map((a) => (
                <span key={a} className="rounded-full bg-brand-50 px-3 py-1.5 text-[13px] font-semibold">
                  {a}
                </span>
              ))}
            </div>
          )}
          {draft.listing.description && (
            <p className="mt-2.5 text-[14px] leading-relaxed">{draft.listing.description}</p>
          )}
          <div className="mt-2 space-y-1.5">
            {POLICY_ROWS.filter((r) => space.policies[r.key] !== null).map((r) => (
              <p key={r.key} className="text-[13.5px]">
                {r.label} {space.policies[r.key] ? "allowed" : "not allowed"}
              </p>
            ))}
            {space.independent === true && <p className="text-[13.5px]">Fully independent</p>}
            {space.independent === false && (
              <p className="text-[13.5px]">Shares entrance with owner</p>
            )}
            {(place.buildingType === "PG" || place.buildingType === "HOSTEL") &&
              space.pgFood !== "" && (
                <p className="text-[13.5px]">
                  {space.pgFood === "included"
                    ? "Food included in rent"
                    : space.pgFood === "separate"
                      ? "Food available separately"
                      : "No food provided"}
                </p>
              )}
            {(place.buildingType === "PG" || place.buildingType === "HOSTEL") &&
              space.pgCurfew === true &&
              place.gateTime && <p className="text-[13.5px]">Gate closes at {place.gateTime}</p>}
          </div>
          {space.houseRules.trim() && (
            <p className="mt-2 rounded-xl bg-paper px-3 py-2.5 text-[13.5px] leading-relaxed">
              {space.houseRules}
            </p>
          )}
        </section>
      )}

      <section aria-label="Availability" className="flex items-center justify-between rounded-2xl border border-line bg-white p-4">
        <div>
          <h3 className="text-[15px] font-bold">Availability</h3>
          <p className="text-[14px] text-muted">{availabilityLine(draft)}</p>
        </div>
        <PreviewEdit onGo={() => go("movein")} />
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Chapter 13 — Publish (frontend-only readiness boundary)             */
/* ------------------------------------------------------------------ */

export function PublishChapter({
  draft,
  go,
  onPublishState,
  onSend,
  sending,
  sendError,
  sendResult,
  listingId,
  onPublish,
  publishing,
  publishError,
  published,
}: {
  draft: ListingDraft;
  go: (step: ChapterId) => void;
  /** Local-only publish simulation. No backend call is made. */
  onPublishState: (state: LocalPublishState) => void;
  /** Real backend send: Property → Unit → Listing → Price → Availability. */
  onSend: () => void;
  sending: boolean;
  sendError: string | null;
  sendResult: Extract<SubmitResult, { ok: true }> | null;
  /** Backend listing id; null until the send flow creates it. */
  listingId: number | null;
  /** Real publish: DRAFT -> PUBLISHED through POST /publish. */
  onPublish: () => void;
  publishing: boolean;
  publishError: string | null;
  /** Authoritative PUBLISHED state after a successful publish call. */
  published: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const checks = readiness(draft);
  const ok = allReady(draft);
  const live = draft.localPublish === "live";
  const readyPhotos = draft.photos.filter((p) => p.status === "ready").length;
  // Real publish needs a sent listing plus 3 backend-confirmed photos.
  // Anything less keeps the honest send path below.
  const canPublish = ok && listingId != null && readyPhotos >= 3;

  // A completed backend send closes the confirm dialog; the sendResult
  // confirmation panel above takes over. A completed publish closes the
  // publish dialog; the published panel above takes over.
  useEffect(() => {
    if (sendResult) setConfirming(false);
  }, [sendResult]);
  useEffect(() => {
    if (published) setConfirmPublish(false);
  }, [published]);
  // Any settled publish failure closes the sheet too: the authoritative
  // error panel below stays visible with Try again. The page clears the
  // error when a new attempt starts, so every failure is a fresh
  // null -> message transition and this always fires exactly once per
  // failure, for every status/network failure alike.
  useEffect(() => {
    if (publishError) setConfirmPublish(false);
  }, [publishError]);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-brand-700">
          Publish
        </p>
        <h2 className="mt-1.5 text-[24px] font-bold leading-[1.15] tracking-tight lg:text-[28px]">
          {live ? "You're live (preview)" : "Almost ready to go live"}
        </h2>
        <p className="mt-2 max-w-xl text-[14.5px] leading-relaxed text-muted">
          {live
            ? "This is how publishing will feel. Nothing has been sent anywhere yet."
            : "Finish the checklist, then publish when it feels right."}
        </p>
      </div>

      {published && (
        <div className="rounded-2xl border border-line bg-white p-4" role="status">
          <p className="text-[14.5px] font-bold">Published on Apun-Ghar ✓</p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
            Renters can now see your listing.
          </p>
          <Link
            href="/owner/dashboard"
            className="mt-3 flex min-h-[52px] items-center justify-center rounded-2xl bg-brand-600 text-[16px] font-bold text-white transition active:scale-[0.98]"
          >
            Back to Studio
          </Link>
        </div>
      )}
      {sendResult && !published && (
        <div className="rounded-2xl border border-line bg-white p-4" role="status">
          <p className="text-[14.5px] font-bold">Sent to Apun-Ghar ✓</p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
            {submitSuccessMessage(sendResult)}
          </p>
          <Link
            href="/owner/dashboard"
            className="mt-3 flex min-h-[52px] items-center justify-center rounded-2xl bg-brand-600 text-[16px] font-bold text-white transition active:scale-[0.98]"
          >
            Back to Studio
          </Link>
        </div>
      )}
      {publishError && (
        <div className="rounded-2xl border border-line bg-white p-4" role="alert">
          <p className="text-[14.5px] font-bold">Couldn&apos;t publish</p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{publishError}</p>
          <button
            type="button"
            onClick={onPublish}
            disabled={publishing}
            className="mt-3 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-brand-600 text-[16px] font-bold text-white transition active:scale-[0.98] disabled:opacity-50"
          >
            {publishing ? "Publishing…" : "Try again"}
          </button>
        </div>
      )}
      {sendError && (
        <div className="rounded-2xl border border-line bg-white p-4" role="alert">
          <p className="text-[14.5px] font-bold">Couldn&apos;t send everything</p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{sendError}</p>
          <button
            type="button"
            onClick={onSend}
            disabled={sending}
            className="mt-3 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-brand-600 text-[16px] font-bold text-white transition active:scale-[0.98] disabled:opacity-50"
          >
            {sending ? "Sending…" : "Try again"}
          </button>
        </div>
      )}
      {live && (
        <div className="flex items-center gap-2 rounded-2xl bg-[#2F7D4F] px-4 py-3 text-white">
          <span aria-hidden className="text-[16px] font-bold">
            ✓
          </span>
          <p className="text-[14.5px] font-bold">Live preview — renters can&apos;t see this yet</p>
        </div>
      )}
      {draft.localPublish === "paused" && (
        <div className="flex items-center gap-2 rounded-2xl bg-cream px-4 py-3">
          <p className="text-[14.5px] font-bold text-muted">Paused preview — hidden from renters</p>
        </div>
      )}
      {celebrating && live && (
        <div className="rounded-2xl border border-line bg-white p-5 text-center">
          <p className="text-[22px] font-bold">You&apos;re live 🎉</p>
          <p className="mt-1 text-[14px] text-muted">
            This is a local preview only — nothing was published to Apun-Ghar.
          </p>
          <div className="mt-4 grid gap-2">
            <button
              type="button"
              onClick={() => {
                setCelebrating(false);
                onPublishState("paused");
              }}
              className="flex min-h-[52px] items-center justify-center rounded-2xl border border-line bg-white text-[15.5px] font-bold transition active:scale-[0.98]"
            >
              Pause listing
            </button>
            <Link
              href="/owner/dashboard"
              className="flex min-h-[52px] items-center justify-center rounded-2xl bg-brand-600 text-[16px] font-bold text-white transition active:scale-[0.98]"
            >
              Back to Studio
            </Link>
          </div>
        </div>
      )}

      <section aria-label="Readiness checklist" className="rounded-2xl bg-ink p-5 text-white">
        <ul className="space-y-2.5">
          {checks.map((c) => (
            <li key={c.key} className="flex items-center gap-2.5">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                  c.ok ? "bg-[#2F7D4F]" : "bg-white/15"
                }`}
                aria-hidden
              >
                <span className="text-[14px] font-bold">{c.ok ? "✓" : "·"}</span>
              </span>
              <span className="flex-1">
                <span className="block text-[14px] font-bold">{c.label}</span>
                <span className="block text-[12.5px] text-white/65">{c.detail}</span>
              </span>
              {!c.ok && (
                <button
                  type="button"
                  onClick={() => go(c.step)}
                  className="shrink-0 rounded-lg bg-white/12 px-3 py-1.5 text-[13px] font-bold"
                >
                  Fix →
                </button>
              )}
            </li>
          ))}
        </ul>
        {published ? (
          <p className="mt-4 rounded-2xl bg-[#2F7D4F] px-4 py-3 text-center text-[15px] font-bold text-white">
            Live on Apun-Ghar ✓
          </p>
        ) : canPublish ? (
          <button
            type="button"
            onClick={() => setConfirmPublish(true)}
            className="mt-4 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-white text-[16px] font-bold text-ink transition active:scale-[0.98] disabled:opacity-40"
          >
            Publish listing
          </button>
        ) : !live ? (
          <button
            type="button"
            disabled={!ok}
            onClick={() => setConfirming(true)}
            className="mt-4 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-white text-[16px] font-bold text-ink transition active:scale-[0.98] disabled:opacity-40"
          >
            Send to Apun-Ghar
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onPublishState("paused")}
            className="mt-4 flex min-h-[52px] w-full items-center justify-center rounded-2xl border border-white/25 text-[15.5px] font-bold transition active:scale-[0.98]"
          >
            Pause listing
          </button>
        )}
        {draft.localPublish === "paused" && (
          <button
            type="button"
            disabled={!ok}
            onClick={() => setConfirming(true)}
            className="mt-2 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-white text-[16px] font-bold text-ink transition active:scale-[0.98] disabled:opacity-40"
          >
            Publish again
          </button>
        )}
      </section>

      {confirming && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/45 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm publish"
        >
          <div className="w-full max-w-md rounded-t-3xl bg-white p-6 pb-8 sm:rounded-3xl">
            <h3 className="text-[18px] font-bold">Send to Apun-Ghar?</h3>
            <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
              This sends your property, room, listing, prices and availability
              to Apun-Ghar, saved as a draft — not visible to renters yet.
              Photos and final publishing come later.
            </p>
            <div className="mt-5 grid gap-2">
              <button
                type="button"
                onClick={onSend}
                disabled={sending}
                className="flex min-h-[52px] items-center justify-center rounded-2xl bg-brand-600 text-[16px] font-bold text-white transition active:scale-[0.98] disabled:opacity-50"
              >
                {sending ? "Sending…" : "Yes, send to Apun-Ghar"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={sending}
                className="flex min-h-[52px] items-center justify-center rounded-2xl border border-line bg-white text-[15.5px] font-bold transition active:scale-[0.98] disabled:opacity-50"
              >
                Keep editing
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmPublish && !published && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/45 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm publish"
        >
          <div className="w-full max-w-md rounded-t-3xl bg-white p-6 pb-8 sm:rounded-3xl">
            <h3 className="text-[18px] font-bold">Publish this listing?</h3>
            <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
              This makes your listing visible to renters on Apun-Ghar —
              {readyPhotos} of 3 required photos ready.
            </p>
            <div className="mt-5 grid gap-2">
              <button
                type="button"
                onClick={onPublish}
                disabled={publishing}
                className="flex min-h-[52px] items-center justify-center rounded-2xl bg-brand-600 text-[16px] font-bold text-white transition active:scale-[0.98] disabled:opacity-50"
              >
                {publishing ? "Publishing…" : "Yes, publish"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmPublish(false)}
                disabled={publishing}
                className="flex min-h-[52px] items-center justify-center rounded-2xl border border-line bg-white text-[15.5px] font-bold transition active:scale-[0.98] disabled:opacity-50"
              >
                Keep editing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
