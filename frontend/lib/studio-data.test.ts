/**
 * Data tests for the Owner Studio aggregation layer (Phase A).
 * Verifies normalized DATA only — no UI, no network, no Firebase.
 */
import { describe, expect, it } from "vitest";
import {
  aggregateStudioData,
  loadStudioData,
  type StudioInput,
} from "./studio-data";
import { ApiError } from "./api";
import { emptyDraft, type ListingDraft } from "./listing-draft";

const NOW = new Date("2026-09-24T12:00:00Z").getTime();
const DAY = 24 * 60 * 60 * 1000;

function prop(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    property_type: "PG",
    address_line: `${id} Test Road`,
    locality: null,
    city: "Guwahati",
    area_location_id: 7,
    area_location: { id: 7, type: "area", name: "Beltola", city: "Guwahati" },
    ...overrides,
  };
}

function unit(id: number, propertyId: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    property_id: propertyId,
    unit_type: "PRIVATE_ROOM",
    layout: null,
    ...overrides,
  };
}

function priceRow(overrides: Record<string, unknown> = {}) {
  return {
    charge_type: "RENT",
    amount_paise: 800000,
    billing_frequency: "MONTHLY",
    calculation_basis: "PER_PERSON",
    mandatory: true,
    included_in_advertised: true,
    ...overrides,
  };
}

function listing(id: number, unitId: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    rental_unit_id: unitId,
    title: `Listing ${id}`,
    description: null,
    rent_basis: "PER_PERSON",
    status: "PUBLISHED",
    availability_status: "AVAILABLE_NOW",
    available_from: null,
    price_components: [priceRow()],
    photos: [{ id: 1 }],
    created_at: new Date(NOW - DAY).toISOString(),
    ...overrides,
  };
}

function draft(id: string, overrides: Partial<ListingDraft> = {}): ListingDraft {
  const d = emptyDraft(id);
  d.updatedAt = NOW;
  d.listing.title = `Draft ${id}`;
  return Object.assign(d, overrides);
}

function input(over: Partial<StudioInput> = {}): StudioInput {
  return {
    properties: [],
    unitsByProperty: {},
    listings: [],
    drafts: [],
    now: NOW,
    ...over,
  };
}

function apiError(status: number, message: string): ApiError {
  return new ApiError(status, message);
}

describe("empty owner", () => {
  it("aggregates to zeros with no sections", () => {
    const data = aggregateStudioData(input());
    expect(data.summary).toEqual({
      propertyCount: 0,
      unitCount: 0,
      listingCount: 0,
      publishedCount: 0,
      pausedCount: 0,
      draftListingCount: 0,
      pendingCount: 0,
      localDraftCount: 0,
    });
    expect(data.properties).toEqual([]);
    expect(data.drafts).toEqual([]);
    expect(data.attention).toEqual([]);
    expect(data.insights.availability).toEqual({
      availableNow: 0,
      availableFromDate: 0,
      occupied: 0,
    });
  });
});

describe("property → unit → listing hierarchy", () => {
  it("nests one property / one unit / one listing", () => {
    const data = aggregateStudioData(
      input({
        properties: [prop(1)],
        unitsByProperty: { 1: [unit(10, 1)] },
        listings: [listing(100, 10)],
      })
    );
    expect(data.properties).toHaveLength(1);
    expect(data.properties[0].units).toHaveLength(1);
    expect(data.properties[0].units[0].listing?.id).toBe(100);
    expect(data.summary).toMatchObject({
      propertyCount: 1,
      unitCount: 1,
      listingCount: 1,
      publishedCount: 1,
    });
  });

  it("handles one property with multiple units, some unlisted", () => {
    const data = aggregateStudioData(
      input({
        properties: [prop(1)],
        unitsByProperty: { 1: [unit(10, 1), unit(11, 1), unit(12, 1)] },
        listings: [listing(100, 10), listing(101, 12, { status: "PAUSED" })],
      })
    );
    const units = data.properties[0].units;
    expect(units.map((u) => u.listing?.id ?? null)).toEqual([100, null, 101]);
    expect(data.summary).toMatchObject({
      unitCount: 3,
      listingCount: 2,
      publishedCount: 1,
      pausedCount: 1,
    });
  });

  it("keeps multiple properties separate with correct association", () => {
    const data = aggregateStudioData(
      input({
        properties: [prop(1), prop(2)],
        unitsByProperty: { 1: [unit(10, 1)], 2: [unit(20, 2, { unit_type: "ENTIRE_FLAT", layout: "1 BHK" })] },
        listings: [listing(100, 20)],
      })
    );
    expect(data.properties[0].units[0].listing).toBeNull();
    expect(data.properties[1].units[0].listing?.id).toBe(100);
    expect(data.properties[1].units[0].displayKind).toBe("1 BHK");
    expect(data.properties[0].units[0].displayKind).toBe("Private room");
    expect(data.properties[1].areaName).toBe("Beltola");
  });
});

describe("rent normalization", () => {
  it("exposes the RENT component numerically", () => {
    const data = aggregateStudioData(
      input({
        properties: [prop(1)],
        unitsByProperty: { 1: [unit(10, 1)] },
        listings: [listing(100, 10)],
      })
    );
    expect(data.properties[0].units[0].listing?.rent).toEqual({
      amountPaise: 800000,
      billingFrequency: "MONTHLY",
      calculationBasis: "PER_PERSON",
    });
  });

  it("represents missing or unusable RENT as null (never ₹0)", () => {
    const noRent = listing(100, 10, { price_components: [] });
    const nullAmount = listing(101, 11, {
      price_components: [priceRow({ amount_paise: null })],
    });
    const data = aggregateStudioData(
      input({
        properties: [prop(1)],
        unitsByProperty: { 1: [unit(10, 1), unit(11, 1)] },
        listings: [noRent, nullAmount],
      })
    );
    const [a, b] = data.properties[0].units;
    expect(a.listing?.rent).toBeNull();
    expect(b.listing?.rent).toBeNull();
    expect(data.insights.health.missingRent).toBe(2);
  });
});

describe("lifecycle and availability stay separate", () => {
  it("tracks published / paused / draft lifecycles", () => {
    const data = aggregateStudioData(
      input({
        properties: [prop(1)],
        unitsByProperty: { 1: [unit(10, 1), unit(11, 1), unit(12, 1)] },
        listings: [
          listing(100, 10, { status: "PUBLISHED" }),
          listing(101, 11, { status: "PAUSED" }),
          listing(102, 12, { status: "DRAFT" }),
        ],
      })
    );
    expect(data.summary).toMatchObject({
      publishedCount: 1,
      pausedCount: 1,
      draftListingCount: 1,
    });
    expect(data.insights.health).toMatchObject({ published: 1, paused: 1, draft: 1 });
  });

  it("keeps PUBLISHED + OCCUPIED distinct (live but occupied)", () => {
    const data = aggregateStudioData(
      input({
        properties: [prop(1)],
        unitsByProperty: { 1: [unit(10, 1)] },
        listings: [listing(100, 10, { status: "PUBLISHED", availability_status: "OCCUPIED" })],
      })
    );
    const l = data.properties[0].units[0].listing!;
    expect(l.lifecycle).toBe("PUBLISHED");
    expect(l.availability).toEqual({ status: "OCCUPIED", availableFrom: null });
    expect(data.insights.availability.occupied).toBe(1);
  });

  it("retains the from-date and counts availability modes", () => {
    const data = aggregateStudioData(
      input({
        properties: [prop(1)],
        unitsByProperty: { 1: [unit(10, 1), unit(11, 1), unit(12, 1)] },
        listings: [
          listing(100, 10, { availability_status: "AVAILABLE_NOW" }),
          listing(101, 11, {
            availability_status: "AVAILABLE_FROM_DATE",
            available_from: "2026-10-01",
          }),
          listing(102, 12, { availability_status: "OCCUPIED" }),
        ],
      })
    );
    expect(data.insights.availability).toEqual({
      availableNow: 1,
      availableFromDate: 1,
      occupied: 1,
    });
    const dated = data.properties[0].units[1].listing!;
    expect(dated.availability.availableFrom).toBe("2026-10-01");
  });
});

describe("local drafts", () => {
  it("classifies a never-sent draft as local with chapters", () => {
    const d = draft("d1");
    const data = aggregateStudioData(input({ drafts: [d] }));
    expect(data.drafts).toHaveLength(1);
    expect(data.drafts[0]).toMatchObject({
      draftId: "d1",
      title: "Draft d1",
      kind: "local",
      currentChapter: "what",
      remainingSteps: [],
    });
    expect(data.summary).toMatchObject({ localDraftCount: 1, pendingCount: 0 });
    // Fresh local drafts are Continue candidates, not attention.
    expect(data.attention).toEqual([]);
  });

  it("flags local drafts older than 7 days, not fresh ones", () => {
    const old = draft("old");
    old.updatedAt = NOW - 8 * DAY;
    const fresh = draft("fresh");
    const data = aggregateStudioData(input({ drafts: [old, fresh] }));
    expect(data.attention).toHaveLength(1);
    expect(data.attention[0]).toMatchObject({
      reason: "stale-draft",
      draftId: "old",
      priority: 2,
      draftAgeDays: 8,
    });
  });
});

describe("sent-but-incomplete drafts", () => {
  it("classifies recorded ids/progress as pending with remaining steps", () => {
    const d = draft("p1");
    d.backendIds = { propertyId: 10, unitId: 20, listingId: null };
    const data = aggregateStudioData(input({ drafts: [d] }));
    expect(data.drafts[0]).toMatchObject({
      kind: "pending",
      remainingSteps: ["listing", "price", "availability"],
    });
    expect(data.summary).toMatchObject({ pendingCount: 1, localDraftCount: 0 });
  });

  it("surfaces incomplete sends as top-priority attention", () => {
    const d = draft("p1");
    d.backendIds = { propertyId: 10, unitId: 20, listingId: 30 };
    d.submitProgress = { price: true, availability: false };
    const data = aggregateStudioData(input({ drafts: [d] }));
    expect(data.attention).toHaveLength(1);
    expect(data.attention[0]).toMatchObject({
      reason: "send-incomplete",
      priority: 1,
      draftId: "p1",
      listingId: 30,
      unitId: 20,
      propertyId: 10,
      remainingSteps: ["availability"],
    });
  });

  it("keeps draft and backend listing side by side without merging", () => {
    const d = draft("p1");
    d.backendIds = { propertyId: 1, unitId: 10, listingId: 100 };
    d.submitProgress = { price: false, availability: false };
    const data = aggregateStudioData(
      input({
        properties: [prop(1)],
        unitsByProperty: { 1: [unit(10, 1)] },
        listings: [listing(100, 10)],
        drafts: [d],
      })
    );
    expect(data.properties[0].units[0].listing?.id).toBe(100);
    expect(data.drafts[0].kind).toBe("pending");
    expect(data.summary.listingCount).toBe(1);
  });
});

describe("listing health attention", () => {
  it("never surfaces photo counts as attention (raw observation only)", () => {
    const data = aggregateStudioData(
      input({
        properties: [prop(1)],
        unitsByProperty: { 1: [unit(10, 1), unit(11, 1)] },
        listings: [
          listing(100, 10, { status: "PUBLISHED", photos: [] }),
          listing(101, 11, { status: "PUBLISHED", photos: [{ id: 1 }] }),
        ],
      })
    );
    // Retained as a data integrity observation, never user-facing attention:
    // the publish guard requires 3+ READY photos, so this state is
    // unreachable through the product flow.
    expect(data.insights.health.missingPhotos).toBe(1);
    expect(data.attention).toEqual([]);
  });

  it("caps attention at 5 in priority order", () => {
    const drafts = Array.from({ length: 7 }, (_, i) => {
      const d = draft(`p${i}`);
      d.backendIds = { propertyId: i + 1, unitId: null, listingId: null };
      d.updatedAt = NOW - i * DAY;
      return d;
    });
    const data = aggregateStudioData(input({ drafts }));
    expect(data.attention).toHaveLength(5);
    expect(data.attention.every((a) => a.reason === "send-incomplete")).toBe(true);
  });
});

describe("malformed and missing backend data", () => {
  it("skips malformed rows and counts them", () => {
    const data = aggregateStudioData(
      input({
        properties: [prop(1), null, { id: "x" }, { id: 2, property_type: 5, address_line: "y" }],
        unitsByProperty: { 1: [unit(10, 1), null, { id: 11 }] },
        listings: [listing(100, 10), null, { id: 101 }],
      })
    );
    expect(data.properties).toHaveLength(1);
    expect(data.properties[0].units).toHaveLength(1);
    expect(data.errors.discarded).toEqual({ properties: 3, units: 2, listings: 2 });
  });

  it("aggregates units and drafts when listings are unavailable", () => {
    const d = draft("d1");
    const data = aggregateStudioData(
      input({
        properties: [prop(1)],
        unitsByProperty: { 1: [unit(10, 1)] },
        listings: null,
        drafts: [d],
      })
    );
    expect(data.properties[0].units[0].listing).toBeNull();
    expect(data.drafts).toHaveLength(1);
    expect(data.errors.listingsUnavailable).toBe(true);
  });
});

describe("loadStudioData fetch behavior", () => {
  function deps(over: Record<string, unknown> = {}) {
    return {
      uid: "user-1",
      fetchProperties: async () => [prop(1)],
      fetchUnits: async () => [unit(10, 1)],
      fetchListings: async () => [listing(100, 10)],
      loadLocalDrafts: () => ({}) as Record<string, ListingDraft>,
      now: NOW,
      ...over,
    };
  }

  it("loads and joins the full tree", async () => {
    const result = await loadStudioData(deps());
    expect(result.status).toBe("ok");
    expect(result.inventoryError).toBeNull();
    expect(result.data.summary).toMatchObject({
      propertyCount: 1,
      unitCount: 1,
      listingCount: 1,
    });
  });

  it("keeps local drafts when listings fail", async () => {
    const d = draft("d1");
    const result = await loadStudioData(
      deps({
        fetchListings: async () => {
          throw new Error("boom");
        },
        loadLocalDrafts: () => ({ d1: d }),
      })
    );
    expect(result.status).toBe("ok");
    expect(result.data.errors.listingsUnavailable).toBe(true);
    expect(result.data.drafts).toHaveLength(1);
    expect(result.data.properties[0].units[0].listing).toBeNull();
  });

  it("returns inventory-error with drafts when properties fail", async () => {
    const d = draft("d1");
    const result = await loadStudioData(
      deps({
        fetchProperties: async () => {
          throw new Error("down");
        },
        loadLocalDrafts: () => ({ d1: d }),
      })
    );
    expect(result.status).toBe("inventory-error");
    expect(result.inventoryError).toBe("down");
    expect(result.data.properties).toEqual([]);
    expect(result.data.drafts).toHaveLength(1);
  });

  it("returns auth-error on 401", async () => {
    const result = await loadStudioData(
      deps({
        fetchProperties: async () => {
          throw apiError(401, "Invalid Firebase ID token");
        },
      })
    );
    expect(result.status).toBe("auth-error");
    expect(result.inventoryError).toBe("Invalid Firebase ID token");
  });
});
