/**
 * Focused tests for backend-id normalization (M3) and submit-progress
 * invalidation (edit-after-success staleness fix).
 */
import { describe, expect, it } from "vitest";
import {
  chapterIndex,
  emptyDraft,
  loadDrafts,
  nextChapter,
  nextSubmitProgress,
  normalizeBackendId,
  prefillPlaceFromProperty,
  prevChapter,
  validateChooseProperty,
  validatePlaceName,
  type ListingDraft,
  type SubmitProgress,
} from "./listing-draft";
import type { OwnerPropertyItem } from "./api";

describe("normalizeBackendId", () => {
  it("accepts positive integers", () => {
    expect(normalizeBackendId(1)).toBe(1);
    expect(normalizeBackendId(10)).toBe(10);
    expect(normalizeBackendId(Number.MAX_SAFE_INTEGER)).toBe(
      Number.MAX_SAFE_INTEGER
    );
  });

  it("rejects zero, negatives, and fractionals", () => {
    expect(normalizeBackendId(0)).toBeNull();
    expect(normalizeBackendId(-1)).toBeNull();
    expect(normalizeBackendId(1.5)).toBeNull();
  });

  it("rejects non-numbers", () => {
    expect(normalizeBackendId(null)).toBeNull();
    expect(normalizeBackendId(undefined)).toBeNull();
    expect(normalizeBackendId("10")).toBeNull();
    expect(normalizeBackendId(NaN)).toBeNull();
    expect(normalizeBackendId(true)).toBeNull();
    expect(normalizeBackendId({})).toBeNull();
  });
});

describe("nextSubmitProgress (edit-after-success invalidation)", () => {
  function submitted(): ListingDraft {
    const d = emptyDraft("draft-1");
    d.pricing.rent = "8000";
    d.pricing.rentBasis = "person";
    d.pricing.deposit = "16000";
    d.availability.mode = "now";
    d.backendIds = { propertyId: 10, unitId: 20, listingId: 30 };
    d.submitProgress = { price: true, availability: true };
    return d;
  }

  it("a rent edit clears only price progress", () => {
    const d = submitted();
    expect(
      nextSubmitProgress(d, { pricing: { ...d.pricing, rent: "9000" } })
    ).toEqual({ price: false, availability: true });
  });

  it("every price-related edit clears only price progress", () => {
    const baselineExtra = {
      id: "e1", kind: "maintenance", label: "", amount: "1500",
      frequency: "monthly", metered: false, rate: "",
      mandatory: true, included: true,
    } as const;
    const pricePatches: Partial<ListingDraft["pricing"]>[] = [
      // rent basis, deposit
      { rentBasis: "room" },
      { deposit: "20000" },
      // extra amount / frequency / kind / mandatory+included
      { extras: [{ ...baselineExtra, amount: "2500" }] },
      { extras: [{ ...baselineExtra, frequency: "quarterly" }] },
      { extras: [{ ...baselineExtra, kind: "food", frequency: "yearly", amount: "30000" }] },
      { extras: [{ ...baselineExtra, mandatory: false, included: false }] },
      // metered/rate settings replace the fixed row
      { extras: [{ ...baselineExtra, kind: "electricity", amount: "", metered: true, rate: "9", included: false }] },
      // Other label added alongside the baseline row
      { extras: [baselineExtra, { id: "e2", kind: "other", label: "Cleaning", amount: "500", frequency: "once", metered: false, rate: "", mandatory: false, included: false }] },
    ];
    for (const pricingPatch of pricePatches) {
      const d = submitted();
      d.pricing.extras = [{ ...baselineExtra }];
      expect(
        nextSubmitProgress(d, { pricing: { ...d.pricing, ...pricingPatch } })
      ).toEqual({ price: false, availability: true });
    }
  });

  it("removing the last extra still counts as a price change", () => {
    const d = submitted();
    d.pricing.extras = [
      { id: "e1", kind: "maintenance", label: "", amount: "1500", frequency: "monthly", metered: false, rate: "", mandatory: true, included: true },
    ];
    expect(nextSubmitProgress(d, { pricing: { ...d.pricing, extras: [] } })).toEqual({
      price: false,
      availability: true,
    });
  });

  it("availability mode and date edits clear only availability progress", () => {
    const d = submitted();
    expect(
      nextSubmitProgress(d, {
        availability: { mode: "from", date: "2026-10-01" },
      })
    ).toEqual({ price: true, availability: false });

    const d2 = submitted();
    d2.availability = { mode: "from", date: "2026-10-01" };
    expect(
      nextSubmitProgress(d2, {
        availability: { mode: "from", date: "2026-11-01" },
      })
    ).toEqual({ price: true, availability: false });

    const d3 = submitted();
    expect(
      nextSubmitProgress(d3, { availability: { mode: "occupied", date: "" } })
    ).toEqual({ price: true, availability: false });
  });

  it("unrelated edits preserve both flags", () => {
    const unrelated: ((d: ListingDraft) => Partial<ListingDraft>)[] = [
      (d) => ({ listing: { ...d.listing, description: "New description" } }),
      (d) => ({ listing: { ...d.listing, title: "New title here" } }),
      (d) => ({ space: { ...d.space, houseRules: "No smoking" } }),
      (d) => ({ place: { ...d.place, locality: "Downtown" } }),
      (d) => ({ photos: [] }),
      (d) => ({ localPublish: "paused" }),
      (d) => ({ backendIds: { ...d.backendIds } }),
      (d) => ({ submitProgress: { ...d.submitProgress } }),
    ];
    for (const build of unrelated) {
      const d = submitted();
      expect(nextSubmitProgress(d, build(d))).toEqual({
        price: true,
        availability: true,
      });
    }
  });

  it("a value-identical patch does not invalidate", () => {
    const d = submitted();
    expect(
      nextSubmitProgress(d, {
        pricing: { ...d.pricing, extras: [...d.pricing.extras] },
      })
    ).toEqual({ price: true, availability: true });
    expect(
      nextSubmitProgress(d, {
        availability: { ...d.availability },
      })
    ).toEqual({ price: true, availability: true });
  });

  it("never invents completion for unsubmitted or legacy drafts", () => {
    const fresh = emptyDraft("draft-2");
    expect(
      nextSubmitProgress(fresh, { pricing: { ...fresh.pricing, rent: "9000" } })
    ).toEqual({ price: false, availability: false });
    const legacy = submitted();
    (legacy as { submitProgress?: SubmitProgress }).submitProgress = undefined;
    expect(
      nextSubmitProgress(legacy, { pricing: { ...legacy.pricing, rent: "9000" } })
    ).toEqual({ price: false, availability: false });
  });
});

describe("placeName draft field", () => {
  it("defaults to an empty string", () => {
    expect(emptyDraft("d").place.placeName).toBe("");
  });

  it("old drafts without placeName hydrate to empty string", () => {
    const store: Record<string, string> = {};
    const fakeWindow = {
      localStorage: {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => {
          store[k] = v;
        },
      },
    };
    (globalThis as Record<string, unknown>)["window"] = fakeWindow;
    try {
      const legacy = emptyDraft("old") as unknown as Record<string, unknown>;
      const place = { ...(legacy["place"] as Record<string, unknown>) };
      delete place["placeName"];
      legacy["place"] = place;
      store["owner-listing-drafts:u1"] = JSON.stringify({ old: legacy });
      expect(loadDrafts("u1")["old"].place.placeName).toBe("");
    } finally {
      delete (globalThis as Record<string, unknown>)["window"];
    }
  });

  it("merge preserves an existing placeName", () => {
    const store: Record<string, string> = {};
    const fakeWindow = {
      localStorage: {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => {
          store[k] = v;
        },
      },
    };
    (globalThis as Record<string, unknown>)["window"] = fakeWindow;
    try {
      const named = emptyDraft("n");
      named.place.placeName = "Green View House";
      store["owner-listing-drafts:u1"] = JSON.stringify({ n: named });
      expect(loadDrafts("u1")["n"].place.placeName).toBe("Green View House");
    } finally {
      delete (globalThis as Record<string, unknown>)["window"];
    }
  });
});

describe("validatePlaceName", () => {
  it("accepts normal names with punctuation and apostrophes", () => {
    for (const name of [
      "Green View House",
      "Downtown Student House",
      "Sunrise Residency",
      "PG No. 4",
      "Owner's Place",
    ]) {
      expect(validatePlaceName({ placeName: name })).toBeNull();
    }
  });

  it("accepts padded names (serializer trims)", () => {
    expect(validatePlaceName({ placeName: "  Green View House  " })).toBeNull();
  });

  it("accepts single-character names like the backend contract", () => {
    for (const name of ["A", "X", "7", "PG", "No. 1"]) {
      expect(validatePlaceName({ placeName: name })).toBeNull();
    }
  });

  it("rejects blank names", () => {
    expect(validatePlaceName({ placeName: "" })).not.toBeNull();
    expect(validatePlaceName({ placeName: "   " })).not.toBeNull();
  });

  it("enforces the 120-character backend limit", () => {
    expect(validatePlaceName({ placeName: "x".repeat(120) })).toBeNull();
    expect(validatePlaceName({ placeName: "x".repeat(121) })).not.toBeNull();
  });
});

describe("placename chapter order", () => {
  it("sits between Where and Space", () => {
    expect(nextChapter("where")).toBe("placename");
    expect(nextChapter("placename")).toBe("space");
    expect(prevChapter("space")).toBe("placename");
    expect(prevChapter("placename")).toBe("where");
  });

  it("keeps Name your listing later in the flow", () => {
    expect(chapterIndex("placename")).toBeGreaterThan(chapterIndex("where"));
    expect(chapterIndex("name")).toBeGreaterThan(chapterIndex("placename"));
    expect(chapterIndex("space")).toBeGreaterThan(chapterIndex("placename"));
  });

  it("sits Choose Property between Kind and Where", () => {
    expect(nextChapter("kind")).toBe("chooseproperty");
    expect(nextChapter("chooseproperty")).toBe("where");
    expect(prevChapter("where")).toBe("chooseproperty");
    expect(prevChapter("chooseproperty")).toBe("kind");
  });
});

function ownedProperty(overrides: Partial<OwnerPropertyItem> = {}): OwnerPropertyItem {
  return {
    id: 42,
    property_type: "ASSAM_TYPE_HOUSE",
    name: "Green View House",
    address_line: "12 Test Road",
    locality: "Near Market",
    city: "Guwahati",
    pincode: "781028",
    area_location_id: 7,
    area_location: { id: 7, type: "area", name: "Beltola", city: "Guwahati" },
    ...overrides,
  };
}

describe("propertySource", () => {
  it("defaults new drafts to new", () => {
    expect(emptyDraft("d").propertySource).toBe("new");
  });

  it("hydrates old drafts without the field as new", () => {
    const store: Record<string, string> = {};
    const fakeWindow = {
      localStorage: {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => {
          store[k] = v;
        },
      },
    };
    (globalThis as Record<string, unknown>)["window"] = fakeWindow;
    try {
      const legacy = emptyDraft("old") as unknown as Record<string, unknown>;
      delete legacy["propertySource"];
      store["owner-listing-drafts:u1"] = JSON.stringify({ old: legacy });
      expect(loadDrafts("u1")["old"].propertySource).toBe("new");
      const existing = emptyDraft("e");
      existing.propertySource = "existing";
      store["owner-listing-drafts:u2"] = JSON.stringify({ e: existing });
      expect(loadDrafts("u2")["e"].propertySource).toBe("existing");
    } finally {
      delete (globalThis as Record<string, unknown>)["window"];
    }
  });

  it("a created propertyId alone never implies existing", () => {
    // BackendIds.propertyId is also set when THIS flow created the
    // property; only the flag is authoritative.
    const d = emptyDraft("d");
    d.backendIds = { propertyId: 10, unitId: null, listingId: null };
    expect(d.propertySource).toBe("new");
    expect(validateChooseProperty(d)).toBeNull();
  });
});

describe("validateChooseProperty", () => {
  it("passes for new-property flow", () => {
    expect(validateChooseProperty(emptyDraft("d"))).toBeNull();
  });

  it("passes for an existing property with a stored id", () => {
    const d = emptyDraft("d");
    d.propertySource = "existing";
    d.backendIds = { propertyId: 42, unitId: null, listingId: null };
    expect(validateChooseProperty(d)).toBeNull();
  });

  it("fails for existing without a stored id", () => {
    const d = emptyDraft("d");
    d.propertySource = "existing";
    expect(validateChooseProperty(d)).not.toBeNull();
  });
});

describe("prefillPlaceFromProperty", () => {
  it("maps every property-derived field, preserving the area object", () => {
    const place = prefillPlaceFromProperty(ownedProperty());
    expect(place).toMatchObject({
      buildingType: "ASSAM_TYPE_HOUSE",
      buildingOther: "",
      placeName: "Green View House",
      address: "12 Test Road",
      locality: "Near Market",
      city: "Guwahati",
      pincode: "781028",
      college: null,
      workplace: null,
      gateTime: "",
    });
    expect(place.area).toEqual({
      id: 7,
      type: "area",
      name: "Beltola",
      city: "Guwahati",
    });
  });

  it("tolerates unnamed properties and missing area", () => {
    const place = prefillPlaceFromProperty(
      ownedProperty({ name: null, area_location: null, locality: null, city: null, pincode: null })
    );
    expect(place.placeName).toBe("");
    expect(place.area).toBeNull();
    expect(place.locality).toBe("");
    expect(place.city).toBe("");
  });

  it("falls back to OTHER with empty detail for unknown backend types", () => {
    const place = prefillPlaceFromProperty(
      ownedProperty({ property_type: "STUDIO_BUILDING" })
    );
    expect(place.buildingType).toBe("OTHER");
    // The raw enum must never reach renter-facing listing text.
    expect(place.buildingOther).toBe("");
  });
});

describe("property switch invalidation", () => {
  it("changing propertyId resets price/availability progress", () => {
    const d = emptyDraft("d");
    d.backendIds = { propertyId: 10, unitId: 20, listingId: 30 };
    d.submitProgress = { price: true, availability: true };
    expect(
      nextSubmitProgress(d, {
        backendIds: { propertyId: 42, unitId: null, listingId: null },
      })
    ).toEqual({ price: false, availability: false });
  });
});
