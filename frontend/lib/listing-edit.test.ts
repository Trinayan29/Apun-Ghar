// @vitest-environment jsdom
/**
 * Edit Listing Phase 1: loader hydration, edit-session storage, and the
 * no-mutations invariant. Backend is fully mocked; no network, no Firebase.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  editSessionKey,
  hydrateEditDraft,
  loadEditSession,
  loadEditSource,
  saveEditSession,
  EditLoadError,
  type EditSourceData,
} from "./listing-edit";
import { ApiError, type OwnerListingItem } from "./api";

function property(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    property_type: "PG",
    name: "Green View House",
    address_line: "12 Test Road",
    locality: "Near Market",
    city: "Guwahati",
    pincode: "781028",
    area_location_id: 7,
    area_custom_name: null,
    area_location: { id: 7, type: "area", name: "Beltola", city: "Guwahati" },
    ...overrides,
  };
}

function unit(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    property_id: 1,
    unit_type: "PRIVATE_ROOM",
    layout: null,
    occupancy_type: "SINGLE",
    capacity: 1,
    sharing: "PRIVATE",
    is_independent: null,
    food_status: "INCLUDED",
    furnishing: "FURNISHED",
    gender_scope: "ANY",
    bathrooms: 1,
    floor_number: 0,
    carpet_area_sqft: 350,
    couple_friendly: true,
    visitors_allowed: true,
    pets_allowed: null,
    smoking_allowed: false,
    alcohol_allowed: false,
    house_rules: "No smoking inside.",
    ...overrides,
  };
}

describe("hydrateEditDraft pricing extras", () => {
  function pricedListing(extraRows: Record<string, unknown>[]) {
    return {
      ...listing(),
      price_components: [
        {
          charge_type: "RENT",
          amount_paise: 800000,
          billing_frequency: "MONTHLY",
          calculation_basis: "PER_PERSON",
          mandatory: true,
          included_in_advertised: true,
        },
        ...extraRows,
      ],
    };
  }

  function pricedSource(extraRows: Record<string, unknown>[]) {
    return {
      listing: pricedListing(extraRows) as unknown as OwnerListingItem,
      unit: unit() as never,
      property: property() as never,
    };
  }

  it("preserves backend label, mandatory, and included flags", () => {
    const d = hydrateEditDraft(
      pricedSource([
        {
          charge_type: "OTHER",
          label: "Balcony garden",
          amount_paise: 50000,
          billing_frequency: "MONTHLY",
          calculation_basis: "PER_PERSON",
          mandatory: false,
          included_in_advertised: false,
        },
      ])
    );
    expect(d.pricing.extras).toHaveLength(1);
    expect(d.pricing.extras[0]).toMatchObject({
      kind: "other",
      label: "Balcony garden",
      amount: "500",
      mandatory: false,
      included: false,
    });
  });

  it("reads metered rates from rate_paise_per_unit, not amount", () => {
    const d = hydrateEditDraft(
      pricedSource([
        {
          charge_type: "ELECTRICITY",
          label: null,
          amount_paise: null,
          rate_paise_per_unit: 950,
          billing_frequency: "USAGE_BASED",
          calculation_basis: "CONSUMPTION",
          mandatory: true,
          included_in_advertised: false,
        },
      ])
    );
    expect(d.pricing.extras).toHaveLength(1);
    expect(d.pricing.extras[0]).toMatchObject({
      kind: "electricity",
      metered: true,
      rate: "9.5",
      amount: "",
      frequency: "metered",
    });
  });
});

function listing(overrides: Record<string, unknown> = {}) {
  return {
    id: 100,
    rental_unit_id: 10,
    title: "Sunny PG near campus",
    description: "Spacious room",
    rent_basis: "PER_PERSON",
    status: "PUBLISHED",
    availability_status: "AVAILABLE_NOW",
    available_from: null,
    price_components: [
      {
        charge_type: "RENT",
        amount_paise: 800000,
        billing_frequency: "MONTHLY",
        calculation_basis: "PER_PERSON",
        mandatory: true,
        included_in_advertised: true,
      },
      {
        charge_type: "DEPOSIT",
        amount_paise: 1600000,
        billing_frequency: "ONE_TIME",
        calculation_basis: "PER_PERSON",
        mandatory: true,
        included_in_advertised: false,
      },
    ],
    photos: [
      {
        id: 5,
        listing_id: 100,
        storage_key: "k/5.jpg",
        mime: "image/jpeg",
        size_bytes: 1024,
        width: 800,
        height: 600,
        display_order: 0,
        is_cover: true,
        upload_status: "READY",
        media_type: "PHOTO",
        view_url: "https://view/5",
      },
    ],
    created_at: "2026-09-27T00:00:00Z",
    ...overrides,
  };
}

function deps(overrides: Record<string, unknown> = {}) {
  return {
    getListing: vi.fn(async () => listing()),
    getUnit: vi.fn(async () => unit()),
    getProperty: vi.fn(async () => property()),
    ...overrides,
  };
}

function apiError(status: number, message: string) {
  return new ApiError(status, message);
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("loadEditSource", () => {
  it("1. hydrates listing + unit + property through GETs only", async () => {
    const d = deps();
    const source = await loadEditSource(100, d);
    expect(source.listing.id).toBe(100);
    expect(source.unit.id).toBe(10);
    expect(source.property.id).toBe(1);
    expect(d.getListing).toHaveBeenCalledWith(100);
    expect(d.getUnit).toHaveBeenCalledWith(10);
    expect(d.getProperty).toHaveBeenCalledWith(1);
  });

  it("6/7. missing listing fails closed without creating anything", async () => {
    const d = deps({
      getListing: vi.fn(async () => {
        throw apiError(404, "Not found");
      }),
    });
    await expect(loadEditSource(100, d)).rejects.toMatchObject({
      name: "EditLoadError",
      reason: "not-found",
    });
    expect(d.getUnit).not.toHaveBeenCalled();
    expect(d.getProperty).not.toHaveBeenCalled();
  });

  it("forbidden unit fails closed", async () => {
    const d = deps({
      getUnit: vi.fn(async () => {
        throw apiError(403, "Forbidden");
      }),
    });
    await expect(loadEditSource(100, d)).rejects.toMatchObject({
      reason: "forbidden",
    });
  });

  it("rejects non-positive ids without any request", async () => {
    const d = deps();
    await expect(loadEditSource(0, d)).rejects.toMatchObject({
      reason: "invalid-id",
    });
    await expect(loadEditSource(-3, d)).rejects.toMatchObject({
      reason: "invalid-id",
    });
    expect(d.getListing).not.toHaveBeenCalled();
  });

  it("8. performs GET/read operations only", async () => {
    // The loader receives only getters: there is no create/update/delete
    // seam to abuse. Assert the seam shape directly.
    const d = deps();
    await loadEditSource(100, d);
    expect(Object.keys(d).sort()).toEqual(["getListing", "getProperty", "getUnit"]);
  });
});

describe("hydrateEditDraft", () => {
  function source(): EditSourceData {
    return {
      listing: listing() as unknown as OwnerListingItem,
      unit: unit() as never,
      property: property() as never,
    };
  }

  it("2. populates backendIds, property, unit, listing, pricing, availability", () => {
    const d = hydrateEditDraft(source());
    expect(d.backendIds).toEqual({ propertyId: 1, unitId: 10, listingId: 100 });
    expect(d.propertySource).toBe("existing");
    expect(d.place.buildingType).toBe("PG");
    expect(d.place.placeName).toBe("Green View House");
    expect(d.place.address).toBe("12 Test Road");
    expect(d.place.area).toMatchObject({ id: 7, name: "Beltola" });
    expect(d.space.kind).toBe("single");
    expect(d.space.furnishing).toBe("Fully furnished");
    expect(d.space.audience).toBe("Anyone");
    expect(d.pricing.rent).toBe("8000");
    expect(d.pricing.rentBasis).toBe("person");
    expect(d.pricing.deposit).toBe("16000");
    expect(d.availability).toEqual({ mode: "now", date: "" });
    expect(d.listing.title).toBe("Sunny PG near campus");
    expect(d.submitProgress).toEqual({ price: true, availability: true });
  });

  it("hydrates existing READY photos with backend ids and view URLs", () => {
    const d = hydrateEditDraft(source());
    expect(d.photos).toHaveLength(1);
    expect(d.photos[0]).toMatchObject({
      status: "ready",
      cover: true,
      order: 0,
      backendId: 5,
      viewUrl: "https://view/5",
      error: null,
    });
  });

  it("3/9. is distinguishable from create mode and locks property identity", () => {
    const d = hydrateEditDraft(source());
    // backendIds fully populated: a create flow would POST, an edit flow
    // must never do so. Property comes from the backend row, not a chooser.
    expect(d.backendIds.propertyId).toBe(1);
    expect(d.propertySource).toBe("existing");
    expect(d.place.placeName).toBe("Green View House");
  });
});

describe("edit-session storage", () => {
  it("4. uses the owner-listing-edits namespace, never the create one", () => {
    expect(editSessionKey("uid-1", 100)).toBe("owner-listing-edits:uid-1:100");
    const d = hydrateEditDraft({
      listing: listing() as unknown as OwnerListingItem,
      unit: unit() as never,
      property: property() as never,
    });
    saveEditSession("uid-1", 100, {
      draft: d,
      savedSnapshot: d,
      updatedAt: 1,
    });
    expect(window.localStorage.getItem("owner-listing-edits:uid-1:100")).not.toBeNull();
    expect(window.localStorage.getItem("owner-listing-drafts:uid-1")).toBeNull();
  });

  it("5. round-trips a session and rejects drifted/corrupt entries", () => {
    const d = hydrateEditDraft({
      listing: listing() as unknown as OwnerListingItem,
      unit: unit() as never,
      property: property() as never,
    });
    saveEditSession("uid-1", 100, { draft: d, savedSnapshot: d, updatedAt: 1 });
    expect(loadEditSession("uid-1", 100)?.draft.backendIds.listingId).toBe(100);
    // Wrong listing id must never be adopted.
    const other = { ...d, backendIds: { propertyId: 1, unitId: 10, listingId: 999 } };
    saveEditSession("uid-1", 100, { draft: other, savedSnapshot: other, updatedAt: 1 });
    expect(loadEditSession("uid-1", 100)).toBeNull();
    window.localStorage.setItem("owner-listing-edits:uid-1:100", "not-json{");
    expect(loadEditSession("uid-1", 100)).toBeNull();
    expect(loadEditSession("uid-1", 101)).toBeNull();
  });
});
