// @vitest-environment jsdom
/**
 * Regression tests for the public browse page (Phase 2B fixes).
 * The fetch client is injected as a prop; no API, store, or router.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PublicListingsPage from "./page";
import { ApiError } from "@/lib/api";

// next/navigation is framework infrastructure, not an app dependency:
// stub the router so pages render outside the app router.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));
import type {
  PublicListingFilters,
  PublicListingSummary,
} from "@/lib/public-listings";

afterEach(() => {
  cleanup();
});

function summary(id: number, title: string): PublicListingSummary {
  return {
    id,
    title,
    description: null,
    rent_basis: "PER_PERSON",
    status: "PUBLISHED",
    availability_status: "AVAILABLE_NOW",
    available_from: null,
    monthly_total_paise: 800000,
    has_variable_charges: false,
    has_usage_charges: false,
    has_optional_charges: false,
    has_one_time_charges: false,
    property: {
      name: null,
      property_type: "PG",
      locality: "Test Locality",
      city: "Guwahati",
      area_name: "Test Area",
    },
    unit: {
      unit_type: "PRIVATE_ROOM",
      layout: null,
      occupancy_type: "SINGLE",
      capacity: 1,
      sharing: "PRIVATE",
      furnishing: "FURNISHED",
      gender_scope: "ANY",
      bathrooms: 1,
      floor_number: null,
      carpet_area_sqft: null,
      couple_friendly: null,
      visitors_allowed: null,
      pets_allowed: null,
      smoking_allowed: null,
      alcohol_allowed: null,
      house_rules: null,
      amenities: [],
    },
    cover_photo: null,
    photo_count: 0,
  };
}

function pageOf(startId: number, count: number): PublicListingSummary[] {
  return Array.from({ length: count }, (_, i) =>
    summary(startId + i, `Place ${startId + i}`)
  );
}

describe("public browse page", () => {
  it("loads the first page with offset 0", async () => {
    const fetchListings = vi.fn(async (_: PublicListingFilters) =>
      pageOf(1, 2)
    );
    render(<PublicListingsPage fetchListings={fetchListings} />);

    expect(await screen.findByText("Showing 2 published places")).toBeDefined();
    expect(screen.getByText("Place 1")).toBeDefined();
    expect(fetchListings).toHaveBeenCalledTimes(1);
    expect(fetchListings.mock.calls[0][0]).toMatchObject({
      limit: 20,
      offset: 0,
    });
  });

  it("appends the next page and then stops", async () => {
    const fetchListings = vi.fn(async (filters: PublicListingFilters) =>
      filters.offset === 0 ? pageOf(1, 20) : pageOf(21, 5)
    );
    render(<PublicListingsPage fetchListings={fetchListings} />);

    expect(await screen.findByText("Showing 20 published places")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Show more places" }));
    expect(await screen.findByText("Showing 25 published places")).toBeDefined();
    expect(screen.getByText("Place 25")).toBeDefined();
    // Partial final page: no further page can be requested.
    expect(
      screen.queryByRole("button", { name: "Show more places" })
    ).toBeNull();
    expect(fetchListings.mock.calls[1][0]).toMatchObject({ offset: 20 });
  });

  it("keeps earlier results when an appended page fails, then retries it", async () => {
    let failNext = false;
    const calls: number[] = [];
    const fetchListings = vi.fn(async (filters: PublicListingFilters) => {
      calls.push(filters.offset ?? 0);
      if (failNext) throw new ApiError(500, "Server error");
      return filters.offset === 0 ? pageOf(1, 20) : pageOf(21, 5);
    });
    render(<PublicListingsPage fetchListings={fetchListings} />);

    expect(await screen.findByText("Showing 20 published places")).toBeDefined();
    failNext = true;
    fireEvent.click(screen.getByRole("button", { name: "Show more places" }));
    expect(await screen.findByText("Server error")).toBeDefined();
    // Earlier results stay visible.
    expect(screen.getByText("Showing 20 published places")).toBeDefined();
    expect(screen.getByText("Place 20")).toBeDefined();

    failNext = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Showing 25 published places")).toBeDefined();
    expect(screen.getByText("Place 21")).toBeDefined();
    // No duplicates, and the failed offset was retried as an append.
    expect(calls).toEqual([0, 20, 20]);
  });

  it("shows a validation error for an unusable budget without refetching", async () => {
    const fetchListings = vi.fn(async (_: PublicListingFilters) => pageOf(1, 2));
    render(<PublicListingsPage fetchListings={fetchListings} />);
    expect(await screen.findByText("Showing 2 published places")).toBeDefined();

    fireEvent.change(screen.getByPlaceholderText("e.g. 8000"), {
      target: { value: "abc" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(
      await screen.findByText("Enter a whole-rupee budget greater than zero.")
    ).toBeDefined();
    expect(fetchListings).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Place 1")).toBeDefined();
  });

  it("rejects an overflowing budget instead of silently dropping the filter", async () => {
    const fetchListings = vi.fn(async (_: PublicListingFilters) => pageOf(1, 2));
    render(<PublicListingsPage fetchListings={fetchListings} />);
    expect(await screen.findByText("Showing 2 published places")).toBeDefined();

    // Safe integer rupees whose paise value overflows a safe integer.
    fireEvent.change(screen.getByPlaceholderText("e.g. 8000"), {
      target: { value: "90071992547410" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(
      await screen.findByText("That budget is too large to use as a filter.")
    ).toBeDefined();
    expect(fetchListings).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Place 2")).toBeDefined();
  });

  it("clears the validation error", async () => {
    const fetchListings = vi.fn(async (_: PublicListingFilters) => pageOf(1, 2));
    render(<PublicListingsPage fetchListings={fetchListings} />);
    expect(await screen.findByText("Showing 2 published places")).toBeDefined();

    fireEvent.change(screen.getByPlaceholderText("e.g. 8000"), {
      target: { value: "abc" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(
      await screen.findByText("Enter a whole-rupee budget greater than zero.")
    ).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    await waitFor(() => {
      expect(
        screen.queryByText("Enter a whole-rupee budget greater than zero.")
      ).toBeNull();
    });
  });
});
