/**
 * Focused tests for backend-id normalization (M3) and submit-progress
 * invalidation (edit-after-success staleness fix).
 */
import { describe, expect, it } from "vitest";
import {
  emptyDraft,
  nextSubmitProgress,
  normalizeBackendId,
  type ListingDraft,
  type SubmitProgress,
} from "./listing-draft";

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
