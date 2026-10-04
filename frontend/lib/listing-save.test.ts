// @vitest-environment jsdom
/**
 * P2.3b save-serializer tests: exact payloads, omit-vs-null, folds,
 * guards, and the fractional-paise + rent-basis regressions.
 * Pure serializer tests only — no network, no storage, no UI.
 */
import { describe, expect, it, vi } from "vitest";
import {
  COMPOSITION_KEYS,
  PROPERTY_KEYS,
  foldDescription,
  planAvailability,
  planPricing,
  planSave,
  serializeListingPatch,
  serializePropertyPatch,
  serializeUnitPatch,
  type SaveContext,
} from "./listing-save";
import { emptyDraft, type ListingDraft } from "./listing-draft";

const CTX: SaveContext = { listingStatus: "PUBLISHED", rentBasis: "PER_PERSON" };

function base(): ListingDraft {
  const d = emptyDraft("save-fixture");
  d.propertySource = "existing";
  d.backendIds = { propertyId: 1, unitId: 10, listingId: 100 };
  return d;
}

/** A realistic saved snapshot (as if hydrated from the server). */
function snapshot(): ListingDraft {
  const d = base();
  d.place.buildingType = "PG";
  d.place.placeName = "Green View House";
  d.place.address = "12 Test Road";
  d.place.areaCustomName = "Jyotikuchi";
  d.place.city = "Guwahati";
  d.place.pincode = "781001";
  d.space.kind = "single";
  d.space.furnishing = "Fully furnished";
  d.space.audience = "Anyone";
  d.space.policies.couples = true;
  d.pricing.rent = "9000";
  d.pricing.rentBasis = "person";
  d.pricing.deposit = "5000";
  d.availability = { mode: "now", date: "" };
  d.listing.title = "Sunny PG near campus";
  return d;
}

function clone(d: ListingDraft): ListingDraft {
  return JSON.parse(JSON.stringify(d)) as ListingDraft;
}

const FORBIDDEN_KEYS = [
  "id",
  "status",
  "property_id",
  "unit_id",
  "listing_id",
  "rental_unit_id",
  "owner_user_id",
  "amenity_ids",
  "amenities",
  "localPublish",
  "currentChapter",
  "furthestChapter",
  "submitProgress",
  "backendIds",
  "propertySource",
  "updatedAt",
];

function expectCleanKeys(body: object, allowed: readonly string[]) {
  for (const k of Object.keys(body)) {
    expect(allowed).toContain(k);
    expect(FORBIDDEN_KEYS).not.toContain(k);
  }
}

describe("serializePropertyPatch", () => {
  it("sends nothing when unchanged", () => {
    const s = snapshot();
    const plan = serializePropertyPatch(clone(s), s);
    expect(plan.send).toBe(false);
    expect(plan.body).toEqual({});
    expect(plan.issues).toEqual([]);
  });

  it("sends only changed fields with exact keys", () => {
    const s = snapshot();
    const d = clone(s);
    d.place.placeName = "Blue View House";
    d.place.pincode = "";
    const plan = serializePropertyPatch(d, s);
    expect(plan.send).toBe(true);
    expect(plan.body).toEqual({
      name: "Blue View House",
      pincode: null,
    });
    expectCleanKeys(plan.body, PROPERTY_KEYS);
  });

  it("rejects blanking a non-nullable field", () => {
    const s = snapshot();
    const d = clone(s);
    d.place.address = "   ";
    const plan = serializePropertyPatch(d, s);
    expect(plan.send).toBe(false);
    expect(plan.issues).toHaveLength(1);
    expect(plan.issues[0].field).toBe("place.address");
    expect(plan.body).not.toHaveProperty("address_line");
  });

  it("rejects a malformed pincode", () => {
    const s = snapshot();
    const d = clone(s);
    d.place.pincode = "abc";
    const plan = serializePropertyPatch(d, s);
    expect(plan.send).toBe(false);
    expect(plan.issues[0].field).toBe("place.pincode");
  });

  it("pins the exact area representation on catalog switch", () => {
    const s = snapshot();
    const d = clone(s);
    d.place.area = { id: 9, type: "area", name: "Beltola", city: "Guwahati" };
    d.place.areaCustomName = "Jyotikuchi";
    const plan = serializePropertyPatch(d, s);
    expect(plan.send).toBe(true);
    // Canonical wins explicitly: id sent, custom text cleared — never
    // left for the backend's silent behavior to decide.
    expect(plan.body.area_location_id).toBe(9);
    expect(plan.body.area_custom_name).toBeNull();
  });

  it("sends the curfew pair when switched on", () => {
    const s = snapshot();
    const d = clone(s);
    d.space.pgCurfew = true;
    d.place.gateTime = "22:30";
    const plan = serializePropertyPatch(d, s);
    expect(plan.body).toMatchObject({
      has_curfew: true,
      gate_closing_time: "22:30",
    });
  });

  it("clears the gate when curfew is switched off", () => {
    const s = snapshot();
    s.space.pgCurfew = true;
    s.place.gateTime = "22:30";
    const d = clone(s);
    d.space.pgCurfew = false;
    const plan = serializePropertyPatch(d, s);
    // has_curfew=false forces gate null (backend 422s false + time).
    expect(plan.body).toMatchObject({
      has_curfew: false,
      gate_closing_time: null,
    });
  });

  it("never mutates its inputs", () => {
    const s = snapshot();
    const d = clone(s);
    d.place.placeName = "Changed";
    const beforeD = JSON.stringify(d);
    const beforeS = JSON.stringify(s);
    serializePropertyPatch(d, s);
    expect(JSON.stringify(d)).toBe(beforeD);
    expect(JSON.stringify(s)).toBe(beforeS);
  });
});

describe("serializeUnitPatch", () => {
  it("sends nothing when unchanged", () => {
    const s = snapshot();
    const plan = serializeUnitPatch(clone(s), s);
    expect(plan.send).toBe(false);
    expect(plan.body).toEqual({});
  });

  it("sends the complete composition tuple on rental-type change", () => {
    const s = snapshot();
    const d = clone(s);
    d.space.kind = "shared";
    d.space.beds = 2;
    const plan = serializeUnitPatch(d, s);
    expect(plan.send).toBe(true);
    for (const k of COMPOSITION_KEYS) expect(plan.body).toHaveProperty(k);
    expect(plan.body).toMatchObject({
      unit_type: "SHARED_ROOM_BED",
      occupancy_type: "DOUBLE",
      capacity: 2,
      sharing: "SHARED",
      layout: null,
    });
  });

  it("nulls composition fields explicitly for whole-home", () => {
    const s = snapshot();
    const d = clone(s);
    d.space.kind = "bhk2";
    const plan = serializeUnitPatch(d, s);
    expect(plan.body).toMatchObject({
      unit_type: "ENTIRE_FLAT",
      layout: "2 BHK",
      occupancy_type: null,
      capacity: null,
      sharing: null,
    });
  });

  it("never sends a partial composition", () => {
    const s = snapshot();
    const d = clone(s);
    d.space.furnishing = "Unfurnished";
    const plan = serializeUnitPatch(d, s);
    // Non-composition change: zero composition keys present.
    for (const k of COMPOSITION_KEYS)
      expect(plan.body).not.toHaveProperty(k);
    expect(plan.body.furnishing).toBe("UNFURNISHED");
  });

  it("omits (never nulls) unspecified furnishing and audience", () => {
    const s = snapshot();
    s.space.furnishing = "Fully furnished";
    s.space.audience = "Anyone";
    const d = clone(s);
    d.space.furnishing = "";
    d.space.audience = "";
    const plan = serializeUnitPatch(d, s);
    expect(plan.body).not.toHaveProperty("furnishing");
    expect(plan.body).not.toHaveProperty("gender_scope");
  });

  it("blocks shared rooms without a bed count", () => {
    const s = snapshot();
    const d = clone(s);
    d.space.kind = "shared";
    d.space.beds = null;
    const plan = serializeUnitPatch(d, s);
    expect(plan.send).toBe(false);
    expect(plan.issues[0].field).toBe("space.beds");
    for (const k of COMPOSITION_KEYS)
      expect(plan.body).not.toHaveProperty(k);
  });

  it("maps blank house rules to null and exact-keys everything", () => {
    const s = snapshot();
    s.space.houseRules = "No noise after 10pm.";
    s.space.policies.pets = true;
    const d = clone(s);
    d.space.houseRules = "";
    d.space.policies.pets = false;
    const plan = serializeUnitPatch(d, s);
    expect(plan.body.house_rules).toBeNull();
    expect(plan.body.pets_allowed).toBe(false);
    expectCleanKeys(plan.body, [
      ...COMPOSITION_KEYS,
      "is_independent",
      "food_status",
      "furnishing",
      "gender_scope",
      "bathrooms",
      "floor_number",
      "carpet_area_sqft",
      "couple_friendly",
      "visitors_allowed",
      "pets_allowed",
      "smoking_allowed",
      "alcohol_allowed",
      "house_rules",
    ]);
    expect(plan.body).not.toHaveProperty("amenity_ids");
  });
});

describe("serializeListingPatch + foldDescription", () => {
  it("sends nothing when unchanged", () => {
    const s = snapshot();
    expect(serializeListingPatch(clone(s), s)).toEqual({
      send: false,
      body: {},
      issues: [],
    });
  });

  it("trims the title and rejects a blank one", () => {
    const s = snapshot();
    const d = clone(s);
    d.listing.title = "  Renamed place  ";
    expect(serializeListingPatch(d, s).body).toEqual({ title: "Renamed place" });
    const blank = clone(s);
    blank.listing.title = " ";
    const plan = serializeListingPatch(blank, s);
    expect(plan.send).toBe(false);
    expect(plan.issues[0].field).toBe("listing.title");
    expect(plan.body).not.toHaveProperty("title");
  });

  it("folds OTHER detail without duplicating", () => {
    expect(foldDescription("Nice place.", ["Cozy studio"])).toBe(
      "Nice place.\n\nCozy studio"
    );
    // Already folded: stable, no double-append (retry-safe).
    expect(
      foldDescription("Nice place.\n\nCozy studio", ["Cozy studio"])
    ).toBe("Nice place.\n\nCozy studio");
    // Description that IS the detail stays as-is.
    expect(foldDescription("Cozy studio", ["Cozy studio"])).toBe(
      "Cozy studio"
    );
    // Empty description with a bit yields just the bit.
    expect(foldDescription("", ["Cozy studio"])).toBe("Cozy studio");
    expect(foldDescription("", [])).toBeNull();
  });

  it("sends folded description only when sources changed", () => {
    const s = snapshot();
    s.listing.description = "Nice place.";
    const d = clone(s);
    d.space.kind = "other";
    d.space.detail = "Cozy studio";
    const plan = serializeListingPatch(d, s);
    expect(plan.send).toBe(true);
    expect(plan.body.description).toBe("Nice place.\n\nCozy studio");
  });

  it("does not resend an already-folded description", () => {
    const s = snapshot();
    s.listing.description = "Nice place.\n\nCozy studio";
    s.space.kind = "other";
    s.space.detail = "Cozy studio";
    const plan = serializeListingPatch(clone(s), s);
    expect(plan.send).toBe(false);
    expect(plan.body).toEqual({});
  });

  it("clears the description with explicit null", () => {
    const s = snapshot();
    s.listing.description = "Nice place.";
    const d = clone(s);
    d.listing.description = "";
    const plan = serializeListingPatch(d, s);
    expect(plan.send).toBe(true);
    expect(plan.body.description).toBeNull();
  });

  it("never emits rent_basis, ids, or lifecycle", () => {
    const s = snapshot();
    const d = clone(s);
    d.listing.title = "Renamed";
    d.pricing.rentBasis = "room";
    const plan = serializeListingPatch(d, s);
    expect(plan.body).not.toHaveProperty("rent_basis");
    expectCleanKeys(plan.body, ["title", "description"]);
  });
});

describe("planPricing", () => {
  const basis = "PER_PERSON" as const;

  it("sends nothing when the sets match", () => {
    const s = snapshot();
    const plan = planPricing(clone(s), s, basis);
    expect(plan).toEqual({ send: false, body: [], issues: [] });
  });

  it("sends the complete set on a rent change", () => {
    const s = snapshot();
    const d = clone(s);
    d.pricing.rent = "10000";
    const plan = planPricing(d, s, basis);
    expect(plan.send).toBe(true);
    expect(plan.issues).toEqual([]);
    const types = plan.body.map((r) => r.charge_type).sort();
    expect(types).toEqual(["DEPOSIT", "RENT"]);
    expect(
      plan.body.find((r) => r.charge_type === "RENT")?.amount_paise
    ).toBe(1000000);
  });

  it("blocks invalid extras instead of dropping them", () => {
    const s = snapshot();
    const d = clone(s);
    d.pricing.extras = [
      {
        id: "extra-0",
        kind: "food",
        label: "",
        amount: "five hundred",
        frequency: "monthly",
        metered: false,
        rate: "",
        mandatory: true,
        included: true,
      },
    ];
    const plan = planPricing(d, s, basis);
    expect(plan.send).toBe(false);
    expect(plan.issues.length).toBeGreaterThan(0);
    expect(plan.issues[0].field).toContain("pricing.extras[0]");
  });

  it("blocks an OTHER extra without a label (C9)", () => {
    const s = snapshot();
    const d = clone(s);
    d.pricing.extras = [
      {
        id: "extra-0",
        kind: "other",
        label: "  ",
        amount: "100",
        frequency: "monthly",
        metered: false,
        rate: "",
        mandatory: false,
        included: false,
      },
    ];
    const plan = planPricing(d, s, basis);
    expect(plan.send).toBe(false);
    expect(plan.issues[0].field).toBe("pricing.extras[0].label");
  });

  it("1050-paise regression: untouched fractional data stays untouched", () => {
    const s = snapshot();
    // Server holds fractional paise; hydration surfaces it exactly.
    s.pricing.rent = "10.5";
    const plan = planPricing(clone(s), s, basis);
    expect(plan.send).toBe(false);
    expect(plan.issues).toEqual([]);
  });

  it("1050-paise regression: changing TO a canonical value still guards the set", () => {
    const s = snapshot();
    s.pricing.rent = "10.5";
    const d = clone(s);
    d.pricing.deposit = "6000";
    // The PUT would carry the untouched fractional rent (parsed as 105
    // rupees) — block instead of corrupting it as a side effect.
    const plan = planPricing(d, s, basis);
    expect(plan.send).toBe(false);
    expect(plan.issues[0].field).toBe("pricing.rent");
    expect(plan.issues[0].message).toMatch(/whole number of rupees/);
  });

  it("1050-paise regression: editing the fractional value itself fails", () => {
    const s = snapshot();
    s.pricing.rent = "9000";
    const d = clone(s);
    d.pricing.rent = "10.5";
    const plan = planPricing(d, s, basis);
    expect(plan.send).toBe(false);
    expect(plan.issues[0].field).toBe("pricing.rent");
  });

  it("uses the server basis when the draft basis is unset", () => {
    const s = snapshot();
    s.pricing.rentBasis = "";
    const d = clone(s);
    d.pricing.rent = "10000";
    const plan = planPricing(d, s, "PER_ROOM");
    expect(plan.send).toBe(true);
    expect(
      plan.body.find((r) => r.charge_type === "RENT")?.calculation_basis
    ).toBe("PER_ROOM");
  });
});

describe("planAvailability", () => {
  it("never defaults empty mode to AVAILABLE_NOW", () => {
    const s = snapshot();
    s.availability = { mode: "", date: "" };
    expect(planAvailability(clone(s), s, "DRAFT").send).toBe(false);
    // Draft empty vs snapshot set: still no mutation.
    const d = clone(s);
    s.availability = { mode: "now", date: "" };
    expect(planAvailability(d, s, "DRAFT").send).toBe(false);
  });

  it("sends valid transitions with exact keys", () => {
    const s = snapshot();
    const d = clone(s);
    d.availability = { mode: "from", date: "2099-01-15" };
    const plan = planAvailability(d, s, "PUBLISHED");
    expect(plan).toEqual({
      send: true,
      body: {
        availability_status: "AVAILABLE_FROM_DATE",
        available_from: "2099-01-15",
      },
      issues: [],
    });
    expectCleanKeys(plan.body, ["availability_status", "available_from"]);
  });

  it("rejects past and missing dates", () => {
    const s = snapshot();
    const past = clone(s);
    past.availability = { mode: "from", date: "2000-01-01" };
    expect(planAvailability(past, s, "DRAFT").issues[0].field).toBe(
      "availability.date"
    );
    const missing = clone(s);
    missing.availability = { mode: "from", date: "" };
    expect(planAvailability(missing, s, "DRAFT").send).toBe(false);
    const bad = clone(s);
    bad.availability = { mode: "from", date: "15-01-2099" };
    expect(planAvailability(bad, s, "DRAFT").issues[0].field).toBe(
      "availability.date"
    );
  });

  it("blocks OCCUPIED on PUBLISHED but allows it on DRAFT", () => {
    const s = snapshot();
    const d = clone(s);
    d.availability = { mode: "occupied", date: "" };
    const blockedPlan = planAvailability(d, s, "PUBLISHED");
    expect(blockedPlan.send).toBe(false);
    expect(blockedPlan.issues[0].field).toBe("availability.mode");
    const ok = planAvailability(d, s, "DRAFT");
    expect(ok.send).toBe(true);
    expect(ok.body.availability_status).toBe("OCCUPIED");
  });
});

describe("planSave", () => {
  it("a clean pair plans no calls and no issues", () => {
    const s = snapshot();
    const plan = planSave(clone(s), s, CTX);
    expect(plan.issues).toEqual([]);
    expect(plan.rentBasisChanged).toBe(false);
    expect(plan.rentBasis).toBeNull();
    for (const slice of [
      plan.property,
      plan.unit,
      plan.listing,
      plan.pricing,
      plan.availability,
    ])
      expect(slice.send).toBe(false);
  });

  it("exposes a rent-basis change for the orchestrator branch", () => {
    const s = snapshot();
    const d = clone(s);
    d.pricing.rentBasis = "room";
    const plan = planSave(d, s, CTX);
    expect(plan.rentBasisChanged).toBe(true);
    expect(plan.rentBasis).toBe("PER_ROOM");
    expect(plan.listing.send).toBe(true);
    expect(plan.listing.body.rent_basis).toBe("PER_ROOM");
    expect(plan.issues).toEqual([]);
  });

  it("does not flag an unset draft basis as a change", () => {
    const s = snapshot();
    s.pricing.rentBasis = "";
    const plan = planSave(clone(s), s, CTX);
    expect(plan.rentBasisChanged).toBe(false);
    expect(plan.listing.body).not.toHaveProperty("rent_basis");
  });

  it("fails closed on an unknown server basis", () => {
    const s = snapshot();
    const d = clone(s);
    d.listing.title = "Renamed";
    const plan = planSave(d, s, {
      listingStatus: "PUBLISHED",
      rentBasis: "PER_WHATEVER",
    });
    expect(plan.rentBasisChanged).toBe(false);
    expect(plan.issues.length).toBeGreaterThan(0);
    for (const slice of [
      plan.property,
      plan.unit,
      plan.listing,
      plan.pricing,
    ])
      expect(slice.send).toBe(false);
  });

  it("aggregates issues across slices", () => {
    const s = snapshot();
    const d = clone(s);
    d.place.address = " ";
    d.pricing.rent = "10.5";
    const plan = planSave(d, s, CTX);
    const fields = plan.issues.map((i) => i.field).sort();
    expect(fields).toEqual(["place.address", "pricing.rent"]);
  });

  it("never mutates draft or snapshot", () => {
    const s = snapshot();
    const d = clone(s);
    d.listing.title = "Renamed";
    d.space.kind = "shared";
    d.space.beds = 3;
    d.pricing.rent = "12000";
    const beforeD = JSON.stringify(d);
    const beforeS = JSON.stringify(s);
    planSave(d, s, CTX);
    expect(JSON.stringify(d)).toBe(beforeD);
    expect(JSON.stringify(s)).toBe(beforeS);
  });

  it("emits no network, storage, or UI-coupled calls", () => {
    const s = snapshot();
    const d = clone(s);
    d.place.placeName = "Changed";
    const fetchSpy = vi.fn();
    const store = window.localStorage;
    const realFetch = globalThis.fetch;
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: fetchSpy,
        setItem: fetchSpy,
        removeItem: fetchSpy,
        clear: fetchSpy,
      },
      configurable: true,
    });
    (globalThis as Record<string, unknown>).fetch = fetchSpy;
    try {
      const plan = planSave(d, s, CTX);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(plan.property.send).toBe(true);
    } finally {
      Object.defineProperty(window, "localStorage", {
        value: store,
        configurable: true,
      });
      globalThis.fetch = realFetch;
    }
  });
});
