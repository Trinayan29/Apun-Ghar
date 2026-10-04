/**
 * P2.2 diff-logic tests: savedSnapshot-vs-draft comparison is pure,
 * grouped, human-readable, and volatile-proof.
 */
import { describe, expect, it } from "vitest";
import {
  NOT_SPECIFIED,
  countChanges,
  diffListingChanges,
  hasSignificantChanges,
  type ChangeGroup,
} from "./listing-changes";
import {
  AMENITIES,
  emptyDraft,
  type ListingDraft,
} from "./listing-draft";

function base(): ListingDraft {
  const d = emptyDraft("review-fixture");
  d.propertySource = "existing";
  d.backendIds = { propertyId: 1, unitId: 10, listingId: 100 };
  return d;
}

function groupsOf(before: ListingDraft, after: ListingDraft): ChangeGroup[] {
  return diffListingChanges(before, after);
}

function snapshotOf(d: ListingDraft): string {
  return JSON.stringify(d);
}

describe("diffListingChanges", () => {
  it("no changes => empty diff", () => {
    const b = base();
    const a = base();
    expect(groupsOf(b, a)).toEqual([]);
    expect(countChanges(groupsOf(b, a))).toBe(0);
    expect(hasSignificantChanges(groupsOf(b, a))).toBe(false);
  });

  it("one field changed => exactly one change", () => {
    const b = base();
    const a = base();
    a.listing.title = "Sunny PG near campus";
    const groups = groupsOf(b, a);
    expect(countChanges(groups)).toBe(1);
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe("listing");
    expect(groups[0].changes[0].key).toBe("listing.title");
    expect(groups[0].changes[0].before).toBe(NOT_SPECIFIED);
    expect(groups[0].changes[0].after).toBe("Sunny PG near campus");
  });

  it("multiple fields changed => correct grouped changes", () => {
    const b = base();
    const a = base();
    a.listing.title = "Renamed";
    a.space.kind = "shared";
    a.space.beds = 2;
    a.space.policies.pets = true;
    a.pricing.rent = "9000";
    const groups = groupsOf(b, a);
    const byId = Object.fromEntries(groups.map((g) => [g.id, g]));
    expect(Object.keys(byId).sort()).toEqual(
      ["listing", "pricing", "rules", "space"].sort()
    );
    expect(byId.listing.changes.map((c) => c.key)).toEqual(["listing.title"]);
    expect(byId.space.changes.map((c) => c.key).sort()).toEqual(
      ["space.beds", "space.kind"].sort()
    );
    expect(byId.rules.changes.map((c) => c.key)).toEqual([
      "space.policies.pets",
    ]);
    expect(byId.pricing.changes.map((c) => c.key)).toEqual(["pricing.rent"]);
  });

  it("revert => field disappears from diff", () => {
    const b = base();
    const a = base();
    a.listing.title = "Temporary";
    expect(countChanges(groupsOf(b, a))).toBe(1);
    a.listing.title = b.listing.title;
    expect(groupsOf(b, a)).toEqual([]);
  });

  it("null/unspecified values use product terminology", () => {
    const b = base();
    const a = base();
    a.space.furnishing = "Fully furnished";
    a.space.amenities = ["Wi-Fi"];
    const groups = groupsOf(b, a);
    const all = groups.flatMap((g) => g.changes);
    for (const c of all) {
      expect(c.before).not.toMatch(/null|undefined/i);
      expect(c.after).not.toMatch(/null|undefined/i);
    }
    const furnishing = all.find((c) => c.key === "space.furnishing");
    expect(furnishing?.before).toBe(NOT_SPECIFIED);
    const amenities = all.find((c) => c.key === "space.amenities");
    expect(amenities?.before).toBe("None selected");
    expect(amenities?.after).toBe("Wi-Fi");
    // Clearing back to unspecified reads the same way.
    const c = base();
    c.space.furnishing = "Fully furnished";
    const cleared = { ...base(), space: { ...base().space } };
    const back = groupsOf(c, cleared);
    expect(
      back.flatMap((g) => g.changes).find((f) => f.key === "space.furnishing")
        ?.after
    ).toBe(NOT_SPECIFIED);
  });

  it("enums and booleans use wizard labels, never raw codes", () => {
    const b = base();
    const a = base();
    a.space.kind = "pg_bed";
    a.space.policies.couples = false;
    a.space.pgFood = "included";
    a.space.pgCurfew = true;
    a.availability = { mode: "now", date: "" };
    const all = groupsOf(b, a).flatMap((g) => g.changes);
    const byKey = Object.fromEntries(all.map((c) => [c.key, c]));
    expect(byKey["space.kind"].after).toBe("Bed in PG / Hostel");
    expect(byKey["space.policies.couples"].after).toBe("Not allowed");
    expect(byKey["space.pgFood"].after).toBe("Included in rent");
    expect(byKey["space.pgCurfew"].after).toBe("Yes");
    expect(byKey["availability"].after).toBe("Ready now");
    const dumped = JSON.stringify(all);
    expect(dumped).not.toContain("pg_bed");
    expect(dumped).not.toContain("PER_PERSON");
    expect(dumped).not.toContain("AVAILABLE_NOW");
  });

  it("multi-value changes stay readable without JSON dumps", () => {
    const b = base();
    const a = base();
    a.space.amenities = ["Wi-Fi", "Parking"];
    a.pricing.extras = [
      {
        id: "extra-0",
        kind: "food",
        label: "",
        amount: "500",
        frequency: "monthly",
        metered: false,
        rate: "",
        mandatory: true,
        included: true,
      },
    ];
    const all = groupsOf(b, a).flatMap((g) => g.changes);
    const amenities = all.find((c) => c.key === "space.amenities");
    expect(amenities?.after).toBe("Parking, Wi-Fi");
    const extras = all.find((c) => c.key === "pricing.extras");
    expect(extras?.before).toBe("None");
    expect(extras?.after).toContain("Food");
    expect(extras?.after).toContain("Everyone pays");
    expect(extras?.after).toContain("In headline price");
    expect(extras?.after).not.toContain("extra-0");
    expect(extras?.after).not.toContain("{");
  });

  it("volatile and transient state never appears as changes", () => {
    const b = base();
    const a = base();
    a.updatedAt = Date.now() + 999999;
    a.currentChapter = "price";
    a.furthestChapter = "publish";
    a.submitProgress = { price: true, availability: true };
    a.localPublish = "live";
    a.photos = [
      {
        id: "backend-7",
        name: "Photo 1",
        src: null,
        status: "ready",
        cover: true,
        order: 0,
        backendId: 7,
        viewUrl: "https://fresh-presigned-url.example/x",
        error: "transient boom",
      },
    ];
    // Mirror the same photo with different volatile attachments only.
    b.photos = [
      {
        id: "backend-7",
        name: "Photo 1",
        src: null,
        status: "ready",
        cover: true,
        order: 0,
        backendId: 7,
        viewUrl: "https://stale-presigned-url.example/y",
        error: null,
      },
    ];
    expect(groupsOf(b, a)).toEqual([]);
  });

  it("never mutates savedSnapshot or draft", () => {
    const b = base();
    b.listing.title = "Kept";
    b.space.amenities = ["Wi-Fi"];
    const a = base();
    a.listing.title = "Changed";
    a.space.amenities = ["Wi-Fi", "AC"];
    a.pricing.extras = [
      {
        id: "extra-0",
        kind: "water",
        label: "",
        amount: "100",
        frequency: "monthly",
        metered: false,
        rate: "",
        mandatory: false,
        included: false,
      },
    ];
    const beforeB = snapshotOf(b);
    const beforeA = snapshotOf(a);
    groupsOf(b, a);
    groupsOf(a, b);
    expect(snapshotOf(b)).toBe(beforeB);
    expect(snapshotOf(a)).toBe(beforeA);
  });

  it("commercial changes are visibly identified", () => {
    const b = base();
    b.pricing.rent = "9000";
    b.space.kind = "single";
    const a = base();
    a.pricing.rent = "10000";
    a.space.kind = "shared";
    a.space.beds = 2;
    a.listing.title = "Renamed";
    // Rent basis alone is not commercial.
    const groups = groupsOf(b, a);
    const all = groups.flatMap((g) => g.changes);
    const rent = all.find((c) => c.key === "pricing.rent");
    const kind = all.find((c) => c.key === "space.kind");
    const title = all.find((c) => c.key === "listing.title");
    expect(rent?.significant).toBe(true);
    expect(rent?.before).toBe("₹9,000 / month");
    expect(rent?.after).toBe("₹10,000 / month");
    expect(kind?.significant).toBe(true);
    expect(title?.significant).toBe(false);
    expect(hasSignificantChanges(groups)).toBe(true);
    // A non-commercial edit alone is not flagged.
    const plainBefore = base();
    const plainAfter = base();
    plainAfter.listing.title = "Renamed";
    expect(hasSignificantChanges(groupsOf(plainBefore, plainAfter))).toBe(
      false
    );
  });

  it("amenities use only existing labels — nothing invented", () => {
    const b = base();
    const a = base();
    a.space.amenities = ["Wi-Fi", "Parking"];
    const amenities = groupsOf(b, a)
      .flatMap((g) => g.changes)
      .find((c) => c.key === "space.amenities");
    expect(amenities).toBeDefined();
    for (const label of (amenities?.after ?? "").split(", ")) {
      expect(AMENITIES).toContain(label);
    }
    const dumped = JSON.stringify(amenities);
    expect(dumped).not.toMatch(/amenity_.|AMENITY_|catalog/i);
  });

  it("output order is stable and deterministic", () => {
    const b = base();
    const a = base();
    a.availability = { mode: "from", date: "2026-08-12" };
    a.listing.description = "Nice place";
    a.pricing.deposit = "5000";
    const first = JSON.stringify(groupsOf(b, a));
    const second = JSON.stringify(groupsOf(b, a));
    expect(first).toBe(second);
    expect(groupsOf(b, a).map((g) => g.id)).toEqual([
      "listing",
      "pricing",
      "availability",
    ]);
  });
});
