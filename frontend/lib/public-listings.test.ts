import { describe, expect, it } from "vitest";
import {
  PUBLIC_MAX_OFFSET,
  buildPublicListingsQuery,
  parsePublicListingId,
  publicListingsHasMore,
} from "./public-listings";

describe("buildPublicListingsQuery", () => {
  it("uses backend pagination defaults and omits unset filters", () => {
    expect(buildPublicListingsQuery()).toBe("limit=20&offset=0");
  });

  it("encodes supported filters without inventing defaults", () => {
    expect(
      buildPublicListingsQuery({
        maxMonthlyPaise: 800000,
        propertyType: "PG",
        areaLocationId: 12,
        limit: 20,
        offset: 20,
      })
    ).toBe(
      "limit=20&offset=20&max_monthly_paise=800000&property_type=PG&area_location_id=12"
    );
  });

  it("rejects invalid pagination and filter combinations", () => {
    expect(() => buildPublicListingsQuery({ limit: 0 })).toThrow(/1 to 50/);
    expect(() => buildPublicListingsQuery({ limit: 51 })).toThrow(/1 to 50/);
    expect(() => buildPublicListingsQuery({ offset: -1 })).toThrow(
      /0 to 10000/
    );
    expect(() =>
      buildPublicListingsQuery({ maxMonthlyPaise: -1 })
    ).toThrow(/zero or greater/);
    expect(() =>
      buildPublicListingsQuery({
        // @ts-expect-error invalid property types must be rejected
        propertyType: "VILLA",
      })
    ).toThrow(/not supported/);
    expect(() => buildPublicListingsQuery({ areaLocationId: 0 })).toThrow(
      /positive integer/
    );
  });
});

describe("public pagination boundary", () => {
  it("allows offset 10000 but rejects 10001, mirroring the backend cap", () => {
    expect(PUBLIC_MAX_OFFSET).toBe(10000);
    expect(buildPublicListingsQuery({ limit: 20, offset: 10000 })).toContain(
      "offset=10000"
    );
    expect(() => buildPublicListingsQuery({ limit: 20, offset: 10001 })).toThrow(
      /0 to 10000/
    );
  });

  it("stops paging once the next page would start past the cap", () => {
    // A full page before the cap: the next start (10000) is still valid.
    expect(
      publicListingsHasMore({ offset: 9980, limit: 20, rows: 20 })
    ).toBe(true);
    // A full page starting at the cap extends past it: stop gracefully.
    expect(
      publicListingsHasMore({ offset: 10000, limit: 20, rows: 20 })
    ).toBe(false);
    // A partial page always ends pagination.
    expect(
      publicListingsHasMore({ offset: 0, limit: 20, rows: 7 })
    ).toBe(false);
  });
});

describe("parsePublicListingId", () => {  it("accepts positive integer route IDs and rejects everything else", () => {
    expect(parsePublicListingId("42")).toBe(42);
    expect(parsePublicListingId("0")).toBeNull();
    expect(parsePublicListingId("-7")).toBeNull();
    expect(parsePublicListingId("4.5")).toBeNull();
    expect(parsePublicListingId("abc")).toBeNull();
  });
});
