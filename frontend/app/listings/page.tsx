"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BrandMark } from "@/components/brand";
import { FormError } from "@/components/auth-ui";
import ListingCard from "@/components/listing-card";
import { ApiError, type LocationItem } from "@/lib/api";
import {
  PUBLIC_MAX_OFFSET,
  listPublicListings,
  publicListingsHasMore,
  type PublicListingFilters,
  type PublicListingSummary,
  type PublicPropertyType,
} from "@/lib/public-listings";
import { budgetPaise, parseBudgetRupees } from "@/lib/public-listing-view";
import BrowseFilters from "./_components/browse-filters";

const PAGE_SIZE = 20;

type BrowseStatus = "loading" | "loading-more" | "ready" | "error";

export default function PublicListingsPage({
  // Injected for tests; production uses the real anonymous API client.
  fetchListings = listPublicListings,
}: {
  fetchListings?: (
    filters: PublicListingFilters
  ) => Promise<PublicListingSummary[]>;
} = {}) {
  const [draftBudget, setDraftBudget] = useState("");
  const [draftPropertyType, setDraftPropertyType] = useState<
    "" | PublicPropertyType
  >("");
  const [draftArea, setDraftArea] = useState<LocationItem | null>(null);
  // Base applied filters (always offset 0). Pagination offsets are
  // derived per request and never stored here, so a retry can always
  // rebuild either the first page or the failed appended page.
  const [filters, setFilters] = useState<PublicListingFilters>({
    limit: PAGE_SIZE,
    offset: 0,
  });
  const [listings, setListings] = useState<PublicListingSummary[]>([]);
  const [status, setStatus] = useState<BrowseStatus>("loading");
  const [error, setError] = useState("");
  const [filterError, setFilterError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [failedAppend, setFailedAppend] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(
    async (next: PublicListingFilters, append = false) => {
      const id = ++requestId.current;
      setStatus(append ? "loading-more" : "loading");
      setError("");
      try {
        const rows = await fetchListings(next);
        if (requestId.current !== id) return;
        setListings((previous) => (append ? [...previous, ...rows] : rows));
        setHasMore(
          publicListingsHasMore({
            offset: next.offset ?? 0,
            limit: next.limit ?? PAGE_SIZE,
            rows: rows.length,
          })
        );
        setFailedAppend(false);
        setStatus("ready");
      } catch (err) {
        if (requestId.current !== id) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Couldn't load places. Please try again."
        );
        if (!append) setListings([]);
        setFailedAppend(append);
        setStatus("error");
      }
    },
    [fetchListings]
  );

  useEffect(() => {
    void load({ limit: PAGE_SIZE, offset: 0 });
  }, [load]);

  const apply = () => {
    const parsed = parseBudgetRupees(draftBudget);
    if (parsed.error) {
      // Shown inside the filter form itself, independent of the listing
      // load status, so existing results stay visible and the invalid
      // input is never silently ignored.
      setFilterError(parsed.error);
      return;
    }
    setFilterError(null);
    const paise = budgetPaise(parsed.rupees);
    if (parsed.rupees !== null && paise === null) {
      // parseRupees only yields positive safe integers, so a null here
      // means the paise value overflows: surface it instead of silently
      // sending the request with the budget filter omitted.
      setFilterError("That budget is too large to use as a filter.");
      return;
    }
    const next: PublicListingFilters = {
      limit: PAGE_SIZE,
      offset: 0,
      maxMonthlyPaise: paise ?? undefined,
      propertyType: draftPropertyType === "" ? undefined : draftPropertyType,
      areaLocationId: draftArea?.id,
    };
    setFilters(next);
    void load(next);
  };

  const clear = () => {
    setDraftBudget("");
    setDraftPropertyType("");
    setDraftArea(null);
    setFilterError(null);
    const next: PublicListingFilters = { limit: PAGE_SIZE, offset: 0 };
    setFilters(next);
    void load(next);
  };

  const loadMore = () => {
    // hasMore is already false past the supported window; this guard
    // keeps an unsupported offset unreachable even if state disagrees.
    // The base filters are left untouched: the offset lives only in
    // this request, so a later retry can rebuild the exact failed page.
    if (listings.length > PUBLIC_MAX_OFFSET) return;
    void load({ ...filters, offset: listings.length }, true);
  };

  const retryEmpty = () => {
    void load({ ...filters, offset: 0 });
  };

  const retryAppend = () => {
    // A failed appended page is retried as an append at the same offset,
    // preserving the already-loaded listings; any other failure restarts
    // from the first page of the base filters.
    void load(
      { ...filters, offset: failedAppend ? listings.length : 0 },
      failedAppend
    );
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-5 pb-10 pt-6 lg:px-8">
      <div className="flex items-center justify-between">
        <Link href="/" aria-label="Apun-Ghar home">
          <BrandMark />
        </Link>
        <Link
          href="/signup"
          className="text-[14px] font-bold text-brand-700 underline underline-offset-2"
        >
          Create a renter account
        </Link>
      </div>

      <h1 className="mt-6 text-[24px] font-bold tracking-tight lg:text-[30px]">
        Browse published places
      </h1>
      <p className="mt-1 max-w-xl text-[14px] leading-relaxed text-muted">
        Only currently published owner listings appear here. No login is
        needed to browse.
      </p>

      <BrowseFilters
        draftBudget={draftBudget}
        onBudgetChange={setDraftBudget}
        draftPropertyType={draftPropertyType}
        onPropertyTypeChange={setDraftPropertyType}
        draftArea={draftArea}
        onAreaSelect={setDraftArea}
        onAreaClear={() => setDraftArea(null)}
        disabled={status === "loading" || status === "loading-more"}
        filterError={filterError}
        onApply={apply}
        onClear={clear}
      />

      {(status === "loading" || status === "loading-more") &&
        listings.length === 0 && (
          <p className="mt-8 text-[14px] text-muted" role="status">
            Loading places…
          </p>
        )}

      {status === "error" && listings.length === 0 && (
        <div className="mt-8 max-w-md">
          <FormError message={error} />
          <button
            type="button"
            onClick={retryEmpty}
            className="mt-4 h-12 w-full rounded-xl border border-line bg-white text-[15px] font-semibold"
          >
            Retry
          </button>
        </div>
      )}

      {(status === "ready" ||
        status === "loading-more" ||
        (status === "error" && listings.length > 0)) &&
        listings.length === 0 && (
          <div className="mt-10 max-w-md">
            <h2 className="text-[17px] font-bold">No published places match</h2>
            <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
              Try raising the monthly budget or removing a filter. Draft,
              paused, and unavailable listings are never shown here.
            </p>
            <button
              type="button"
              onClick={clear}
              className="mt-5 min-h-[48px] rounded-2xl bg-brand-600 px-6 text-[14.5px] font-bold text-white"
            >
              Clear filters
            </button>
          </div>
        )}

      {listings.length > 0 && (
        <>
          <p className="mt-6 text-[13.5px] font-semibold" role="status">
            Showing {listings.length} published{" "}
            {listings.length === 1 ? "place" : "places"}
          </p>
          <div className="mt-3 grid gap-4 pb-4 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
          {status === "error" && (
            <div className="max-w-md">
              <FormError message={error} />
              <button
                type="button"
                onClick={retryAppend}
                className="mt-3 h-12 w-full rounded-xl border border-line bg-white text-[15px] font-semibold"
              >
                Retry
              </button>
            </div>
          )}
          {hasMore && status !== "error" && (
            <button
              type="button"
              onClick={loadMore}
              disabled={status === "loading-more"}
              className="mt-2 flex min-h-[52px] w-full items-center justify-center rounded-2xl border border-line bg-white text-[15px] font-bold disabled:opacity-60 sm:mx-auto sm:max-w-xs"
            >
              {status === "loading-more" ? "Loading…" : "Show more places"}
            </button>
          )}
        </>
      )}
    </main>
  );
}
