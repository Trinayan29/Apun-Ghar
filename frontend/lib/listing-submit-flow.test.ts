/**
 * Focused tests for the Property -> Unit -> Listing submit flow.
 * The transport is injected, so no network, Firebase, or DOM is needed.
 */
import { describe, expect, it, vi } from "vitest";
import { emptyDraft, type ListingDraft } from "./listing-draft";
import {
  findAdoptableListing,
  LISTING_RECOVERY_WINDOW_MS,
  submitListingDraft,
  type RecoveryCandidate,
  type Transport,
} from "./listing-submit-flow";

function validDraft(): ListingDraft {
  const d = emptyDraft("draft-1");
  d.space.kind = "single";
  d.space.furnishing = "Fully furnished";
  d.place.buildingType = "PG";
  d.place.address = "12 Test Road";
  d.place.city = "Guwahati";
  d.place.area = { id: 7, type: "area", name: "Beltola", city: "Guwahati" };
  d.pricing.rent = "8000";
  d.pricing.rentBasis = "person";
  d.listing.title = "Sunny PG near campus";
  d.availability.mode = "now";
  return d;
}

function apiError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status });
}

function okTransport(ids: { property: number; unit: number; listing: number }) {
  const calls: { path: string; body: unknown; method: string }[] = [];
  const transport: Transport = async <T,>(
    path: string,
    body: unknown,
    method: "POST" | "PUT" | "GET"
  ): Promise<T> => {
    calls.push({ path, body, method });
    if (path === "/api/v1/owner/properties") return { id: ids.property } as T;
    if (path.endsWith("/units")) return { id: ids.unit } as T;
    return { id: ids.listing } as T;
  };
  return { calls, transport };
}

describe("successful Property -> Unit -> Listing creation", () => {
  it("calls the five endpoints in order with serializer payloads", async () => {
    const { calls, transport } = okTransport({ property: 10, unit: 20, listing: 30 });
    const result = await submitListingDraft(validDraft(), transport);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ids).toEqual({ propertyId: 10, unitId: 20, listingId: 30 });
    expect(result.progress).toEqual({ price: true, availability: true });
    expect(calls.map((c) => c.path)).toEqual([
      "/api/v1/owner/properties",
      "/api/v1/owner/properties/10/units",
      "/api/v1/owner/listings",
      "/api/v1/owner/listings/30/price-components",
      "/api/v1/owner/listings/30/availability",
    ]);
    expect(calls.map((c) => c.method)).toEqual([
      "POST",
      "POST",
      "POST",
      "PUT",
      "POST",
    ]);
    const unitBody = calls[1].body as Record<string, unknown>;
    expect(unitBody["unit_type"]).toBe("PRIVATE_ROOM");
    // C1 regression guard at the wire level: the backend rejects unknown
    // keys (extra="forbid") and only accepts amenity_ids.
    expect(unitBody).not.toHaveProperty("amenity_slugs");
    expect(unitBody).not.toHaveProperty("amenity_ids");
    const listingBody = calls[2].body as Record<string, unknown>;
    expect(listingBody["rental_unit_id"]).toBe(20);
    expect(listingBody["title"]).toBe("Sunny PG near campus");
    const priceBody = calls[3].body as Record<string, unknown>[];
    expect(priceBody[0]["charge_type"]).toBe("RENT");
    expect(priceBody[0]["amount_paise"]).toBe(800000);
    expect(priceBody[0]["calculation_basis"]).toBe("PER_PERSON");
    const availabilityBody = calls[4].body as Record<string, unknown>;
    expect(availabilityBody).toEqual({
      availability_status: "AVAILABLE_NOW",
      available_from: null,
    });
  });

  it("reuses an existing property without POSTing a new one", async () => {
    const { calls, transport } = okTransport({ property: 42, unit: 20, listing: 30 });
    const draft = validDraft();
    draft.propertySource = "existing";
    draft.backendIds = { propertyId: 42, unitId: null, listingId: null };
    const result = await submitListingDraft(draft, transport);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ids).toEqual({ propertyId: 42, unitId: 20, listingId: 30 });
    // No property creation: unit goes straight under property 42.
    expect(calls.map((c) => c.path)).toEqual([
      "/api/v1/owner/properties/42/units",
      "/api/v1/owner/listings",
      "/api/v1/owner/listings/30/price-components",
      "/api/v1/owner/listings/30/availability",
    ]);
  });

  it("reports pending amenities explicitly instead of dropping them", async () => {
    const { transport } = okTransport({ property: 10, unit: 20, listing: 30 });
    const draft = validDraft();
    draft.space.amenities = ["Wi-Fi", "Rooftop pool"];
    const result = await submitListingDraft(draft, transport);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pendingAmenitySlugs).toEqual(["wifi"]);
    expect(result.unknownAmenityLabels).toEqual(["Rooftop pool"]);
  });
});

describe("4E-2 price + availability submission", () => {
  function pricedDraft(): ListingDraft {
    const d = validDraft();
    d.pricing.rent = "12000";
    d.pricing.rentBasis = "room";
    d.pricing.deposit = "24000";
    d.pricing.extras = [
      { id: "e1", kind: "maintenance", label: "", amount: "1500", frequency: "monthly", metered: false, rate: "", mandatory: true, included: true },
      { id: "e2", kind: "food", label: "", amount: "30000", frequency: "yearly", metered: false, rate: "", mandatory: true, included: true },
      { id: "e3", kind: "electricity", label: "", amount: "", frequency: "monthly", metered: true, rate: "9", mandatory: true, included: false },
      { id: "e4", kind: "other", label: "Cleaning", amount: "500", frequency: "once", metered: false, rate: "", mandatory: false, included: false },
    ];
    return d;
  }

  function ids30(): ListingDraft["backendIds"] {
    return { propertyId: 10, unitId: 20, listingId: 30 };
  }

  it("sends the full price set then availability, with representative rows", async () => {
    const { calls, transport } = okTransport({ property: 10, unit: 20, listing: 30 });
    const result = await submitListingDraft(pricedDraft(), transport);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.progress).toEqual({ price: true, availability: true });

    const priceCall = calls.find((c) => c.path.endsWith("/price-components"))!;
    expect(priceCall.method).toBe("PUT");
    const rows = priceCall.body as Record<string, unknown>[];
    const byType = Object.fromEntries(rows.map((r) => [r["charge_type"], r]));

    const rent = byType["RENT"];
    expect(rent["calculation_basis"]).toBe("PER_ROOM");
    expect(rent["amount_paise"]).toBe(1200000);
    expect(rent["billing_frequency"]).toBe("MONTHLY");
    expect(rent["payment_timing"]).toBe("PER_PERIOD");

    const deposit = byType["DEPOSIT"];
    expect(deposit["amount_paise"]).toBe(2400000);
    expect(deposit["billing_frequency"]).toBe("ONE_TIME");
    expect(deposit["payment_timing"]).toBe("UPFRONT_FULL");
    expect(deposit["refundable"]).toBe(true);

    expect(byType["MAINTENANCE"]["amount_paise"]).toBe(150000);
    expect(byType["MAINTENANCE"]["billing_frequency"]).toBe("MONTHLY");
    expect(byType["FOOD"]["billing_frequency"]).toBe("ANNUALLY");

    const elec = byType["ELECTRICITY"];
    expect(elec["calculation_basis"]).toBe("CONSUMPTION");
    expect(elec["billing_frequency"]).toBe("USAGE_BASED");
    expect(elec["variability"]).toBe("VARIABLE");
    expect(elec["amount_paise"]).toBeNull();
    expect(elec["rate_paise_per_unit"]).toBe(900);
    expect(elec["consumption_unit"]).toBe("kWh");

    const other = byType["OTHER"];
    expect(other["label"]).toBe("Cleaning");
    expect(other["amount_paise"]).toBe(50000);
    expect(other["billing_frequency"]).toBe("ONE_TIME");
    expect(other["mandatory"]).toBe(false);
    expect(other["included_in_advertised"]).toBe(false);

    const availabilityCall = calls.find((c) => c.path.endsWith("/availability"))!;
    expect(availabilityCall.method).toBe("POST");
    expect(availabilityCall.body).toEqual({
      availability_status: "AVAILABLE_NOW",
      available_from: null,
    });
  });

  it("maps availability from-date and occupied modes onto the wire", async () => {
    const fromCalls: { path: string; body: unknown }[] = [];
    const fromTransport: Transport = async <T,>(path: string, body: unknown): Promise<T> => {
      fromCalls.push({ path, body });
      if (path === "/api/v1/owner/properties") return { id: 10 } as T;
      if (path.endsWith("/units")) return { id: 20 } as T;
      if (path.endsWith("/price-components")) return [] as T;
      return { id: 30 } as T;
    };
    const fromDraft = validDraft();
    fromDraft.availability.mode = "from";
    fromDraft.availability.date = "2026-12-01";
    const fromResult = await submitListingDraft(fromDraft, fromTransport);
    expect(fromResult.ok).toBe(true);
    expect(fromCalls.find((c) => c.path.endsWith("/availability"))?.body).toEqual({
      availability_status: "AVAILABLE_FROM_DATE",
      available_from: "2026-12-01",
    });

    const { calls, transport } = okTransport({ property: 10, unit: 20, listing: 30 });
    const occupiedDraft = validDraft();
    occupiedDraft.availability.mode = "occupied";
    const occupiedResult = await submitListingDraft(occupiedDraft, transport);
    expect(occupiedResult.ok).toBe(true);
    expect(calls.find((c) => c.path.endsWith("/availability"))?.body).toEqual({
      availability_status: "OCCUPIED",
      available_from: null,
    });
  });

  it("a price failure keeps all ids, marks price incomplete, skips availability", async () => {
    const calls: string[] = [];
    const transport: Transport = async <T,>(path: string): Promise<T> => {
      calls.push(path);
      if (path === "/api/v1/owner/properties") return { id: 10 } as T;
      if (path.endsWith("/units")) return { id: 20 } as T;
      if (path === "/api/v1/owner/listings") return { id: 30 } as T;
      throw apiError(422, "bad price row");
    };
    const result = await submitListingDraft(pricedDraft(), transport);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failedStep).toBe("price");
    expect(result.status).toBe(422);
    expect(result.ids).toEqual(ids30());
    expect(result.progress).toEqual({ price: false, availability: false });
    expect(calls).toHaveLength(4);
    expect(calls[3]).toBe("/api/v1/owner/listings/30/price-components");
  });

  it("an availability failure keeps price complete", async () => {
    const calls: string[] = [];
    const transport: Transport = async <T,>(path: string): Promise<T> => {
      calls.push(path);
      if (path === "/api/v1/owner/properties") return { id: 10 } as T;
      if (path.endsWith("/units")) return { id: 20 } as T;
      if (path === "/api/v1/owner/listings") return { id: 30 } as T;
      if (path.endsWith("/price-components")) return [] as T;
      throw new Error("connection reset");
    };
    const result = await submitListingDraft(pricedDraft(), transport);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failedStep).toBe("availability");
    expect(result.status).toBeUndefined();
    expect(result.ids).toEqual(ids30());
    expect(result.progress).toEqual({ price: true, availability: false });
    expect(calls).toHaveLength(5);
  });

  it("retry after a price failure attempts only price + availability", async () => {
    const calls: string[] = [];
    const transport: Transport = async <T,>(path: string): Promise<T> => {
      calls.push(path);
      if (path.endsWith("/price-components")) return [] as T;
      return { id: 30 } as T;
    };
    const draft = validDraft();
    draft.backendIds = ids30();
    draft.submitProgress = { price: false, availability: false };
    const result = await submitListingDraft(draft, transport);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.progress).toEqual({ price: true, availability: true });
    expect(calls).toEqual([
      "/api/v1/owner/listings/30/price-components",
      "/api/v1/owner/listings/30/availability",
    ]);
  });

  it("retry after an availability failure attempts only availability", async () => {
    const inner = vi.fn(async (_path: string) => ({}));
    const transport: Transport = (async <T,>(
      path: string
    ): Promise<T> => {
      await inner(path);
      return {} as T;
    }) as Transport;
    const draft = validDraft();
    draft.backendIds = ids30();
    draft.submitProgress = { price: true, availability: false };
    const result = await submitListingDraft(draft, transport);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.progress).toEqual({ price: true, availability: true });
    expect(inner).toHaveBeenCalledTimes(1);
    expect(inner).toHaveBeenCalledWith("/api/v1/owner/listings/30/availability");
  });

  it("resubmits edited price/availability with new values instead of skipping", async () => {
    const { calls, transport } = okTransport({ property: 10, unit: 20, listing: 30 });
    const draft = validDraft();
    draft.backendIds = { propertyId: 10, unitId: 20, listingId: 30 };
    // Exactly what the store produces after a rent + availability edit on
    // a fully-submitted draft: flags cleared, values changed.
    draft.submitProgress = { price: false, availability: false };
    draft.pricing.rent = "9000";
    draft.availability.mode = "from";
    draft.availability.date = "2026-10-01";
    const result = await submitListingDraft(draft, transport);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.progress).toEqual({ price: true, availability: true });
    expect(calls.map((c) => c.path)).toEqual([
      "/api/v1/owner/listings/30/price-components",
      "/api/v1/owner/listings/30/availability",
    ]);
    const rows = calls[0].body as Record<string, unknown>[];
    expect(rows.find((r) => r["charge_type"] === "RENT")?.["amount_paise"]).toBe(
      900000
    );
    expect(calls[1].body).toEqual({
      availability_status: "AVAILABLE_FROM_DATE",
      available_from: "2026-10-01",
    });
  });

  it("a fully-submitted draft performs zero network calls", async () => {
    const inner = vi.fn(async () => ({}));
    const transport: Transport = (async <T,>(): Promise<T> => {
      await inner();
      return {} as T;
    }) as Transport;
    const draft = validDraft();
    draft.backendIds = ids30();
    draft.submitProgress = { price: true, availability: true };
    const result = await submitListingDraft(draft, transport);
    expect(result.ok).toBe(true);
    expect(inner).not.toHaveBeenCalled();
  });
});

describe("409 listing recovery (lost create response)", () => {
  function freshRow(overrides: Partial<RecoveryCandidate> = {}): RecoveryCandidate {
    return {
      id: 1127,
      rental_unit_id: 20,
      title: "Sunny PG near campus",
      rent_basis: "PER_PERSON",
      status: "DRAFT",
      price_components: [],
      photos: [],
      created_at: new Date().toISOString(),
      ...overrides,
    };
  }

  function conflictTransport(rows: RecoveryCandidate[] | Error) {
    const posts: string[] = [];
    const gets: string[] = [];
    const transport: Transport = async <T,>(
      path: string,
      body: unknown,
      method: "POST" | "PUT" | "GET"
    ): Promise<T> => {
      if (method === "GET") {
        gets.push(path);
        if (rows instanceof Error) throw rows;
        return rows as T;
      }
      if (path === "/api/v1/owner/listings") {
        posts.push(path);
        throw apiError(409, "Rental unit already has an active listing");
      }
      if (path === "/api/v1/owner/properties") return { id: 10 } as T;
      if (path.endsWith("/units")) return { id: 20 } as T;
      if (path.endsWith("/price-components")) return [] as T;
      return {} as T;
    };
    return { posts, gets, transport };
  }

  it("adopts a fresh empty matching DRAFT and continues without a second POST", async () => {
    const { posts, gets, transport } = conflictTransport([freshRow()]);
    const result = await submitListingDraft(validDraft(), transport);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ids).toEqual({ propertyId: 10, unitId: 20, listingId: 1127 });
    expect(result.progress).toEqual({ price: true, availability: true });
    // Exactly one listing POST (no duplicate attempt after adoption)...
    expect(posts).toEqual(["/api/v1/owner/listings"]);
    // ...one filtered lookup, then price + availability proceed.
    expect(gets).toEqual(["/api/v1/owner/listings?rental_unit_id=20"]);
  });

  it.each([
    ["published status", { status: "PUBLISHED" }],
    ["existing prices", { price_components: [{ id: 1 }] }],
    ["existing photos", { photos: [{ id: 1 }] }],
    [
      "stale created_at",
      { created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
    ],
    ["title mismatch", { title: "Some other place" }],
    ["rent-basis mismatch", { rent_basis: "PER_ROOM" }],
    ["wrong unit", { rental_unit_id: 21 }],
  ])("stays terminal on 409 with %s", async (_label, overrides) => {
    const { posts, gets, transport } = conflictTransport([freshRow(overrides)]);
    const result = await submitListingDraft(validDraft(), transport);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failedStep).toBe("listing");
    expect(result.status).toBe(409);
    expect(result.ids).toEqual({ propertyId: 10, unitId: 20, listingId: null });
    expect(result.progress).toEqual({ price: false, availability: false });
    expect(posts).toHaveLength(1);
    expect(gets).toHaveLength(1);
  });

  it("stays terminal when the lookup finds nothing", async () => {
    const { transport } = conflictTransport([]);
    const result = await submitListingDraft(validDraft(), transport);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failedStep).toBe("listing");
    expect(result.ids.listingId).toBeNull();
  });

  it("stays terminal with the original 409 when the lookup itself fails", async () => {
    const { transport } = conflictTransport(new Error("connection reset"));
    const result = await submitListingDraft(validDraft(), transport);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failedStep).toBe("listing");
    expect(result.status).toBe(409);
    expect(result.error).toBe("Rental unit already has an active listing");
  });

  it("adoption skips already-stored ids and still completes price + availability", async () => {
    const { posts, transport } = conflictTransport([freshRow()]);
    const draft = validDraft();
    // Retry state after the lost response: creations known except listing.
    draft.backendIds = { propertyId: 10, unitId: 20, listingId: null };
    const result = await submitListingDraft(draft, transport);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ids.listingId).toBe(1127);
    expect(posts).toHaveLength(1);
  });
});

describe("findAdoptableListing guards", () => {
  const expected = { title: "Sunny PG near campus", rent_basis: "PER_PERSON" };
  function row(overrides: Partial<RecoveryCandidate> = {}): RecoveryCandidate {
    return {
      id: 1127,
      rental_unit_id: 20,
      title: expected.title,
      rent_basis: expected.rent_basis,
      status: "DRAFT",
      price_components: [],
      photos: [],
      created_at: new Date().toISOString(),
      ...overrides,
    };
  }

  it("accepts a fresh row and picks the first qualifying one", () => {
    expect(findAdoptableListing([row({ id: 5 }), row({ id: 6 })], 20, expected)).toBe(5);
  });

  it("rejects rows outside the recovery window", () => {
    const now = Date.now();
    const justInside = new Date(now - LISTING_RECOVERY_WINDOW_MS + 1000).toISOString();
    const justOutside = new Date(now - LISTING_RECOVERY_WINDOW_MS - 1000).toISOString();
    expect(findAdoptableListing([row({ created_at: justInside })], 20, expected, now)).toBe(1127);
    expect(findAdoptableListing([row({ created_at: justOutside })], 20, expected, now)).toBeNull();
  });

  it("rejects unparseable dates, bad ids, and malformed rows", () => {
    expect(findAdoptableListing([row({ created_at: "not-a-date" })], 20, expected)).toBeNull();
    expect(findAdoptableListing([row({ id: 0 })], 20, expected)).toBeNull();
    expect(findAdoptableListing([row({ id: 1.5 })], 20, expected)).toBeNull();
    expect(
      findAdoptableListing([row({ price_components: null as unknown as [] })], 20, expected)
    ).toBeNull();
    expect(
      findAdoptableListing([null as unknown as RecoveryCandidate], 20, expected)
    ).toBeNull();
  });
});

describe("caller persistence contract (M2)", () => {
  it("never mutates the draft: returned ids are a detached copy", async () => {
    const { transport } = okTransport({ property: 10, unit: 20, listing: 30 });
    const draft = validDraft();
    const before = draft.backendIds;
    const result = await submitListingDraft(draft, transport);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The orchestration does not persist — the caller must.
    expect(draft.backendIds).toBe(before);
    expect(draft.backendIds).toEqual({
      propertyId: null,
      unitId: null,
      listingId: null,
    });
    expect(draft.submitProgress).toEqual({ price: false, availability: false });
    expect(result.ids).not.toBe(draft.backendIds);
    expect(result.ids).toEqual({ propertyId: 10, unitId: 20, listingId: 30 });
    expect(result.progress).not.toBe(draft.submitProgress);
    expect(result.progress).toEqual({ price: true, availability: true });
  });

  it("failure ids survive a storage round-trip and drive the retry", async () => {
    const failTransport: Transport = async <T,>(path: string): Promise<T> => {
      if (path === "/api/v1/owner/properties") return { id: 10 } as T;
      throw apiError(500, "boom");
    };
    const failed = await submitListingDraft(validDraft(), failTransport);
    expect(failed.ok).toBe(false);
    if (failed.ok) return;

    // Simulate what a persisting caller does: JSON round-trip through
    // storage, then resume from the rehydrated ids.
    const persisted = JSON.parse(JSON.stringify(failed.ids)) as ListingDraft["backendIds"];
    const resumed = validDraft();
    resumed.backendIds = persisted;

    const retryCalls: string[] = [];
    const retryTransport: Transport = async <T,>(path: string): Promise<T> => {
      retryCalls.push(path);
      if (path.endsWith("/units")) return { id: 20 } as T;
      return { id: 30 } as T;
    };
    const retried = await submitListingDraft(resumed, retryTransport);
    expect(retried.ok).toBe(true);
    if (!retried.ok) return;
    expect(retried.ids).toEqual({ propertyId: 10, unitId: 20, listingId: 30 });
    expect(retryCalls).toEqual([
      "/api/v1/owner/properties/10/units",
      "/api/v1/owner/listings",
      "/api/v1/owner/listings/30/price-components",
      "/api/v1/owner/listings/30/availability",
    ]);
  });
});

describe("failure at each creation step", () => {
  it("stops at a property failure with empty ids", async () => {
    const calls: string[] = [];
    const transport: Transport = async (path) => {
      calls.push(path);
      throw apiError(422, "bad property");
    };
    const result = await submitListingDraft(validDraft(), transport);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failedStep).toBe("property");
    expect(result.status).toBe(422);
    expect(result.error).toBe("bad property");
    expect(result.ids).toEqual({ propertyId: null, unitId: null, listingId: null });
    expect(calls).toHaveLength(1);
  });

  it("stops at a unit failure and keeps the property id", async () => {
    const calls: string[] = [];
    const transport: Transport = async <T,>(path: string): Promise<T> => {
      calls.push(path);
      if (path === "/api/v1/owner/properties") return { id: 10 } as T;
      throw apiError(403, "forbidden");
    };
    const result = await submitListingDraft(validDraft(), transport);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failedStep).toBe("unit");
    expect(result.status).toBe(403);
    expect(result.ids).toEqual({ propertyId: 10, unitId: null, listingId: null });
    expect(calls).toHaveLength(2);
  });

  it("stops at a listing failure and keeps earlier ids", async () => {
    const calls: string[] = [];
    const transport: Transport = async <T,>(path: string): Promise<T> => {
      calls.push(path);
      if (path === "/api/v1/owner/properties") return { id: 10 } as T;
      if (path.endsWith("/units")) return { id: 20 } as T;
      throw apiError(409, "listing exists");
    };
    const result = await submitListingDraft(validDraft(), transport);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failedStep).toBe("listing");
    expect(result.status).toBe(409);
    expect(result.ids).toEqual({ propertyId: 10, unitId: 20, listingId: null });
    // Recovery was attempted (lookup GET) but found nothing, so the 409
    // stays terminal and availability is never attempted.
    expect(calls).toEqual([
      "/api/v1/owner/properties",
      "/api/v1/owner/properties/10/units",
      "/api/v1/owner/listings",
      "/api/v1/owner/listings?rental_unit_id=20",
    ]);
  });

  it("reports network failures without a status", async () => {
    const transport: Transport = async () => {
      throw new Error("fetch failed");
    };
    const result = await submitListingDraft(validDraft(), transport);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failedStep).toBe("property");
    expect(result.status).toBeUndefined();
    expect(result.error).toBe("fetch failed");
  });

  it("surfaces authentication (401) failures with status", async () => {
    const transport: Transport = async () => {
      throw apiError(401, "Invalid Firebase ID token");
    };
    const result = await submitListingDraft(validDraft(), transport);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(401);
  });
});

describe("retry and duplicate prevention", () => {
  it("a retry resumes from the failed step without recreating", async () => {
    const firstCalls: string[] = [];
    const firstTransport: Transport = async <T,>(path: string): Promise<T> => {
      firstCalls.push(path);
      if (path === "/api/v1/owner/properties") return { id: 10 } as T;
      throw apiError(500, "boom");
    };
    const first = await submitListingDraft(validDraft(), firstTransport);
    expect(first.ok).toBe(false);
    if (first.ok) return;
    expect(firstCalls).toHaveLength(2);

    const secondCalls: string[] = [];
    const secondTransport: Transport = async <T,>(path: string): Promise<T> => {
      secondCalls.push(path);
      if (path.endsWith("/units")) return { id: 20 } as T;
      return { id: 30 } as T;
    };
    const draft = validDraft();
    const second = await submitListingDraft(
      { ...draft, backendIds: first.ids },
      secondTransport
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.ids).toEqual({ propertyId: 10, unitId: 20, listingId: 30 });
    expect(secondCalls).toEqual([
      "/api/v1/owner/properties/10/units",
      "/api/v1/owner/listings",
      "/api/v1/owner/listings/30/price-components",
      "/api/v1/owner/listings/30/availability",
    ]);
  });

  it("a draft with ids but no progress performs only price + availability", async () => {
    const inner = vi.fn(async (_path: string) => ({ id: 1 }));
    const transport: Transport = (async <T,>(path: string): Promise<T> => {
      await inner(path);
      return { id: 1 } as T;
    }) as Transport;
    const draft = validDraft();
    draft.backendIds = { propertyId: 10, unitId: 20, listingId: 30 };
    const result = await submitListingDraft(draft, transport);
    expect(result.ok).toBe(true);
    expect(inner).toHaveBeenCalledTimes(2);
    expect(inner).toHaveBeenNthCalledWith(
      1,
      "/api/v1/owner/listings/30/price-components"
    );
    expect(inner).toHaveBeenNthCalledWith(
      2,
      "/api/v1/owner/listings/30/availability"
    );
  });

  it("a reopened draft with a property id skips property creation", async () => {
    const { calls, transport } = okTransport({ property: 10, unit: 20, listing: 30 });
    const draft = validDraft();
    draft.backendIds = { propertyId: 10, unitId: null, listingId: null };
    const result = await submitListingDraft(draft, transport);
    expect(result.ok).toBe(true);
    expect(calls.map((c) => c.path)).toEqual([
      "/api/v1/owner/properties/10/units",
      "/api/v1/owner/listings",
      "/api/v1/owner/listings/30/price-components",
      "/api/v1/owner/listings/30/availability",
    ]);
  });
});
