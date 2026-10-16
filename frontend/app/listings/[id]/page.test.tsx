// @vitest-environment jsdom
/**
 * Regression tests for the public listing detail page (Phase 2B fixes).
 * The fetch client is injected as a prop; no API, store, or router.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DetailLoader } from "./page";
import { ApiError } from "@/lib/api";
import type { PublicListingDetail } from "@/lib/public-listings";

// next/navigation is framework infrastructure, not an app dependency:
// stub the router so pages render outside the app router.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

afterEach(() => {
  cleanup();
});

function detail(): PublicListingDetail {
  return {
    id: 42,
    title: "Sunny PG near campus",
    description: "Spacious room with attached bath",
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
      couple_friendly: true,
      visitors_allowed: null,
      pets_allowed: null,
      smoking_allowed: null,
      alcohol_allowed: null,
      house_rules: null,
      amenities: [],
    },
    price_components: [],
    photos: [],
  };
}

function renderPage(fetchListing: (id: number) => Promise<PublicListingDetail>) {
  // DetailLoader is rendered directly: React's use() promise unwrapping
  // does not settle in this jsdom toolchain (verified with a minimal
  // repro), so routing-level promise handling is out of scope here.
  return render(<DetailLoader routeId="42" fetchListing={fetchListing} />);
}

describe("public listing detail page", () => {
  it("shows the error state (not 'no longer listed') on initial failure, then renders on retry", async () => {
    let calls = 0;
    const fetchListing = vi.fn(async (id: number) => {
      calls += 1;
      expect(id).toBe(42);
      if (calls === 1) throw new ApiError(500, "Server error");
      return detail();
    });
    renderPage(fetchListing);

    // The transient failure must surface as an error with a Retry
    // button — never as the unavailable state.
    expect(await screen.findByText("Server error")).toBeDefined();
    expect(
      screen.queryByText("This place is no longer listed.")
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Sunny PG near campus")).toBeDefined();
    expect(fetchListing).toHaveBeenCalledTimes(2);
  });

  it("shows the unavailable state for missing listings", async () => {
    const fetchListing = vi.fn(async (_: number) => {
      throw new ApiError(404, "Listing not found");
    });
    renderPage(fetchListing);

    expect(
      await screen.findByText("This place is no longer listed.")
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });
});
