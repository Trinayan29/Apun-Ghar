"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { BrandMark } from "@/components/brand";
import { FormError } from "@/components/auth-ui";
import PhotoFrame from "@/components/photo-frame";
import { ApiError } from "@/lib/api";
import { getPublicListing, parsePublicListingId, type PublicListingDetail } from "@/lib/public-listings";
import {
  detailCoverPhoto,
  displayAvailability,
  displayLocation,
  displayPriceRow,
  displayPropertyType,
  displayRentBasis,
  displayUnitKind,
  monthlyPrice,
  policyFacts,
} from "@/lib/public-listing-view";

type DetailStatus = "loading" | "ready" | "unavailable" | "error";

function DetailTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-1 text-[11.5px] font-semibold text-brand-800">
      {children}
    </span>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-paper px-3 py-2.5">
      <p className="text-[12px] font-semibold text-muted">{label}</p>
      <p className="mt-0.5 text-[14px] font-medium">{value}</p>
    </div>
  );
}

export default function PublicListingDetailPage({
  params,
  fetchListing,
}: {
  params: Promise<{ id: string }>;
  fetchListing?: typeof getPublicListing;
}) {
  const { id } = use(params);
  return <DetailLoader routeId={id} fetchListing={fetchListing} />;
}

/** Exported for tests so the loader can be exercised without React's `use()`. */
export function DetailLoader({
  routeId,
  // Injected for tests; production uses the real anonymous API client.
  fetchListing = getPublicListing,
}: {
  routeId: string;
  fetchListing?: typeof getPublicListing;
}) {
  const listingId = parsePublicListingId(routeId);
  const [listing, setListing] = useState<PublicListingDetail | null>(null);
  const [status, setStatus] = useState<DetailStatus>(
    listingId === null ? "unavailable" : "loading"
  );
  const [error, setError] = useState("");
  const [photoIndex, setPhotoIndex] = useState(0);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    if (listingId === null) {
      setStatus("unavailable");
      return;
    }
    const id = ++requestId.current;
    setStatus("loading");
    setError("");
    try {
      const row = await fetchListing(listingId);
      if (requestId.current !== id) return;
      setListing(row);
      setPhotoIndex(0);
      setStatus("ready");
    } catch (err) {
      if (requestId.current !== id) return;
      if (err instanceof ApiError && err.status === 404) {
        setListing(null);
        setStatus("unavailable");
        return;
      }
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't load this place. Please try again."
      );
      setStatus("error");
    }
  }, [listingId, fetchListing]);

  useEffect(() => {
    void load();
  }, [load]);

  if (status === "loading") {
    return (
      <main className="mx-auto w-full max-w-7xl px-5 py-10 lg:px-8">
        <p className="text-[14px] text-muted" role="status">
          Loading place…
        </p>
      </main>
    );
  }

  // Error first: on an initial-load failure `listing` is still null,
  // so checking `!listing` first would misrender every transient error
  // as "no longer listed" and hide the Retry button.
  if (status === "error") {
    return (
      <main className="mx-auto w-full max-w-md px-5 py-10">
        <FormError message={error} />
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 h-12 w-full rounded-xl border border-line bg-white text-[15px] font-semibold"
        >
          Retry
        </button>
        <Link
          href="/listings"
          className="mt-3 block h-12 w-full rounded-xl border border-line bg-white py-3 text-center text-[15px] font-semibold"
        >
          Back to browse
        </Link>
      </main>
    );
  }

  if (status === "unavailable" || !listing) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-8 text-center">
        <h1 className="text-[20px] font-bold">This place is no longer listed.</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          It may have been paused, removed, or never published. Only
          currently published listings have public details.
        </p>
        <Link
          href="/listings"
          className="mt-5 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-brand-600 text-[15px] font-bold text-white"
        >
          Back to browse
        </Link>
      </main>
    );
  }

  const title = listing.title.trim() || "Untitled listing";
  const price = monthlyPrice(listing);
  const cover = detailCoverPhoto(listing.photos);
  const current =
    listing.photos[Math.min(photoIndex, listing.photos.length - 1)] ?? cover;
  const spaceDetails = [
    listing.unit.occupancy_type,
    typeof listing.unit.capacity === "number"
      ? `${listing.unit.capacity} ${listing.unit.capacity === 1 ? "bed" : "beds"}`
      : null,
    listing.unit.sharing === "PRIVATE"
      ? "Private"
      : listing.unit.sharing === "SHARED"
        ? "Shared"
        : null,
    typeof listing.unit.bathrooms === "number"
      ? `${listing.unit.bathrooms} bath${listing.unit.bathrooms === 1 ? "" : "s"}`
      : null,
    typeof listing.unit.floor_number === "number"
      ? `Floor ${listing.unit.floor_number}`
      : null,
    typeof listing.unit.carpet_area_sqft === "number"
      ? `${listing.unit.carpet_area_sqft} sq ft`
      : null,
  ].filter((value): value is string => Boolean(value));
  const policies = policyFacts(listing.unit);

  return (
    <main className="flex min-h-dvh flex-col pb-10">
      <div className="mx-auto w-full max-w-7xl px-5 pt-6 lg:px-8">
        <div className="flex items-center justify-between">
          <Link href="/" aria-label="Apun-Ghar home">
            <BrandMark />
          </Link>
          <Link
            href="/listings"
            className="text-[14px] font-bold text-brand-700 underline underline-offset-2"
          >
            Back to browse
          </Link>
        </div>
      </div>

      <div className="mx-auto w-full max-w-7xl px-0 sm:px-5 lg:px-8">
        <div className="grid gap-6 lg:mt-3 lg:grid-cols-[1.25fr_1fr]">
          <div>
            <div className="relative">
              <PhotoFrame
                src={current?.view_url ?? null}
                alt={title}
                className="aspect-[4/3] w-full sm:rounded-2xl"
                fallbackLabel={
                  listing.photos.length > 0
                    ? "This photo is unavailable"
                    : "No photos available"
                }
              />
              {listing.photos.length > 1 && (
                <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
                  {listing.photos.map((photo, index) => (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() => setPhotoIndex(index)}
                      aria-label={`Photo ${index + 1}`}
                      className={`h-1.5 rounded-full transition ${
                        index ===
                        Math.min(photoIndex, listing.photos.length - 1)
                          ? "w-6 bg-white"
                          : "w-1.5 bg-white/60"
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
            {listing.photos.length > 1 && (
              <>
                <div className="mt-3 hidden gap-2 overflow-x-auto px-5 sm:flex lg:px-0">
                  {listing.photos.map((photo, index) => (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() => setPhotoIndex(index)}
                      aria-label={`Photo ${index + 1}`}
                      className={`overflow-hidden rounded-xl border-2 ${
                        index ===
                        Math.min(photoIndex, listing.photos.length - 1)
                          ? "border-brand-600"
                          : "border-transparent"
                      }`}
                    >
                      <PhotoFrame
                        src={photo.view_url}
                        alt={`${title} photo ${index + 1}`}
                        className="h-16 w-24"
                      />
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 overflow-x-auto px-5 pt-3 sm:hidden">
                  {listing.photos.map((photo, index) => (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() => setPhotoIndex(index)}
                      aria-label={`Photo ${index + 1}`}
                      className={`overflow-hidden rounded-xl border-2 ${
                        index ===
                        Math.min(photoIndex, listing.photos.length - 1)
                          ? "border-brand-600"
                          : "border-transparent"
                      }`}
                    >
                      <PhotoFrame
                        src={photo.view_url}
                        alt={`${title} photo ${index + 1}`}
                        className="h-14 w-20"
                      />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="px-5 sm:px-0">
            <h1 className="text-[21px] font-bold tracking-tight lg:text-[26px]">
              {title}
            </h1>
            <p className="mt-0.5 text-[14px] text-muted">
              {displayLocation(listing.property)}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <DetailTag>{displayUnitKind(listing.unit)}</DetailTag>
              <DetailTag>
                {displayAvailability(
                  listing.availability_status,
                  listing.available_from
                )}
              </DetailTag>
              <DetailTag>{displayRentBasis(listing.rent_basis)}</DetailTag>
            </div>
            <div className="mt-4 rounded-2xl border border-line bg-white p-4">
              <h2 className="text-[15px] font-bold">Estimated monthly cost</h2>
              <p className="mt-1 text-[20px] font-extrabold tracking-tight">
                {price.amount ? (
                  <>
                    {price.prefix}
                    {price.amount}{" "}
                    <span className="text-[13px] font-semibold text-muted">
                      {price.suffix}
                    </span>
                  </>
                ) : (
                  price.unavailableLabel
                )}
              </p>
              {price.note && (
                <p className="mt-1 text-[13px] leading-relaxed text-muted">
                  {price.note}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4 px-5 pt-4 sm:px-0 lg:grid-cols-3">
          <section
            aria-label="Price breakdown"
            className="rounded-2xl border border-line bg-white p-4"
          >
            <h2 className="text-[15px] font-bold">Price breakdown</h2>
            {listing.price_components.length === 0 ? (
              <p className="mt-2 text-[14px] text-muted">
                No price rows are listed.
              </p>
            ) : (
              <div className="mt-2.5 space-y-2 text-[14px]">
                {listing.price_components.map((row) => {
                  const rendered = displayPriceRow(row);
                  return (
                    <div
                      key={row.id}
                      className="flex items-start justify-between gap-3"
                    >
                      <span className="text-muted">{rendered.label}</span>
                      <span className="shrink-0 font-medium">
                        {rendered.amount}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section
            aria-label="Space and rules"
            className="rounded-2xl border border-line bg-white p-4"
          >
            <h2 className="text-[15px] font-bold">The space</h2>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <Fact label="Space" value={displayUnitKind(listing.unit)} />
              <Fact
                label="Building"
                value={displayPropertyType(listing.property.property_type)}
              />
              <Fact label="Furnishing" value={listing.unit.furnishing} />
              {spaceDetails.length > 0 && (
                <Fact label="Details" value={spaceDetails.join(" · ")} />
              )}
            </div>
            <h3 className="mt-4 text-[15px] font-bold">Amenities</h3>
            {listing.unit.amenities.length > 0 ? (
              <ul className="mt-2 space-y-1.5 text-[14px]">
                {listing.unit.amenities.map((amenity) => (
                  <li key={amenity}>· {amenity}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[14px] text-muted">
                Amenities are not listed.
              </p>
            )}
            <h3 className="mt-4 text-[15px] font-bold">House rules</h3>
            {listing.unit.house_rules?.trim() || policies.length > 0 ? (
              <ul className="mt-2 space-y-1.5 text-[14px] text-muted">
                {listing.unit.house_rules?.trim() && (
                  <li className="whitespace-pre-line text-ink">
                    {listing.unit.house_rules.trim()}
                  </li>
                )}
                {policies.map((policy) => (
                  <li key={policy}>· {policy}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[14px] text-muted">
                House rules are not listed.
              </p>
            )}
          </section>

          <section
            aria-label="About this place"
            className="rounded-2xl border border-line bg-white p-4"
          >
            <h2 className="text-[15px] font-bold">About this place</h2>
            {listing.description?.trim() ? (
              <p className="mt-1.5 whitespace-pre-line text-[14px] leading-relaxed text-muted">
                {listing.description.trim()}
              </p>
            ) : (
              <p className="mt-1.5 text-[14px] text-muted">
                The owner has not added a description.
              </p>
            )}
            {listing.property.name?.trim() &&
              listing.property.name.trim() !== title && (
                <p className="mt-3 text-[13.5px] text-muted">
                  Place:{" "}
                  <span className="font-semibold text-ink">
                    {listing.property.name.trim()}
                  </span>
                </p>
              )}
          </section>
        </div>
      </div>
    </main>
  );
}
