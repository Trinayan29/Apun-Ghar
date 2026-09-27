/**
 * Focused unit tests for the ListingDraft -> backend payload serializer.
 * Pure mapping tests (no network, no DOM, no Firebase).
 */
import { describe, expect, it } from "vitest";
import {
  CONSUMPTION_UNIT_BY_KIND,
  describeAmenities,
  mapAmenityToSlug,
  mapAudience,
  mapBathrooms,
  mapCarpetArea,
  mapFloorNo,
  mapFurnishing,
  mapRentBasis,
  planPhotoUploads,
  resolveAmenityIds,
  serializeAvailability,
  serializeListing,
  serializePriceComponents,
  serializeProperty,
  serializeUnit,
} from "./listing-submit";
import { emptyDraft, type ListingDraft } from "./listing-draft";

function baseDraft(): ListingDraft {
  const d = emptyDraft("test-draft");
  d.space.kind = "single";
  d.space.furnishing = "Fully furnished";
  d.place.buildingType = "PG";
  d.place.address = "12 Test Road";
  d.place.city = "Guwahati";
  return d;
}

describe("G1 — bathrooms / floor / carpet-area mappings", () => {
  it("maps blank values to null", () => {
    expect(mapBathrooms("")).toBeNull();
    expect(mapFloorNo("")).toBeNull();
    expect(mapCarpetArea("")).toBeNull();
  });

  it('maps "3+" to 3 (documented minimum-value approximation)', () => {
    expect(mapBathrooms("3+")).toBe(3);
    expect(mapBathrooms("1")).toBe(1);
    expect(mapBathrooms("2")).toBe(2);
  });

  it('maps "Ground" to 0 and "4+" to 4', () => {
    expect(mapFloorNo("Ground")).toBe(0);
    expect(mapFloorNo("4+")).toBe(4);
    expect(mapFloorNo("2")).toBe(2);
  });

  it('maps "Don\'t know" and garbage to null', () => {
    expect(mapFloorNo("Don't know")).toBeNull();
    expect(mapFloorNo("penthouse")).toBeNull();
    expect(mapBathrooms("lots")).toBeNull();
  });

  it('maps carpet-area "0" to null (backend requires sqft > 0)', () => {
    expect(mapCarpetArea("0")).toBeNull();
    expect(mapCarpetArea("350")).toBe(350);
  });
});

describe("unit composition mapping", () => {
  it("maps a single room to PRIVATE_ROOM/SINGLE/1/PRIVATE", () => {
    const u = serializeUnit(baseDraft());
    expect(u.unit_type).toBe("PRIVATE_ROOM");
    expect(u.occupancy_type).toBe("SINGLE");
    expect(u.capacity).toBe(1);
    expect(u.sharing).toBe("PRIVATE");
    expect(u.layout).toBeNull();
  });

  it("maps shared beds to occupancy + capacity", () => {
    const d = baseDraft();
    d.space.kind = "shared";
    d.space.beds = 3;
    const u = serializeUnit(d);
    expect(u.unit_type).toBe("SHARED_ROOM_BED");
    expect(u.occupancy_type).toBe("TRIPLE");
    expect(u.capacity).toBe(3);
    expect(u.sharing).toBe("SHARED");
  });

  it("maps 5+ beds to QUAD_PLUS with capacity 5", () => {
    const d = baseDraft();
    d.space.kind = "shared";
    d.space.beds = 5;
    const u = serializeUnit(d);
    expect(u.occupancy_type).toBe("QUAD_PLUS");
    expect(u.capacity).toBe(5);
  });

  it("maps whole-home kinds to ENTIRE_FLAT + layout + NULLs (no fakes)", () => {
    const d = baseDraft();
    d.space.kind = "bhk2";
    const u = serializeUnit(d);
    expect(u.unit_type).toBe("ENTIRE_FLAT");
    expect(u.layout).toBe("2 BHK");
    expect(u.occupancy_type).toBeNull();
    expect(u.capacity).toBeNull();
    expect(u.sharing).toBeNull();
  });

  it("maps pg_bed without asking follow-ups", () => {
    const d = baseDraft();
    d.space.kind = "pg_bed";
    const u = serializeUnit(d);
    expect(u.unit_type).toBe("PG_BED");
    expect(u.occupancy_type).toBe("SINGLE");
    expect(u.capacity).toBe(1);
  });

  it("maps other to OTHER with null composition", () => {
    const d = baseDraft();
    d.space.kind = "other";
    d.space.detail = "Shop shutter";
    const u = serializeUnit(d);
    expect(u.unit_type).toBe("OTHER");
    expect(u.capacity).toBeNull();
  });

  it("maps furnishing/audience/policies/house-rules", () => {
    const d = baseDraft();
    d.space.audience = "Women";
    d.space.policies.couples = false;
    d.space.houseRules = "  Quiet after 10pm  ";
    const u = serializeUnit(d);
    expect(mapFurnishing("Fully furnished")).toBe("FURNISHED");
    expect(mapAudience("Women")).toBe("FEMALE");
    expect(u.gender_scope).toBe("FEMALE");
    expect(u.couple_friendly).toBe(false);
    expect(u.visitors_allowed).toBeNull();
    expect(u.house_rules).toBe("Quiet after 10pm");
    const blank = baseDraft();
    expect(serializeUnit(blank).house_rules).toBeNull();
  });

  it("maps labels to slugs and reports unknown labels explicitly", () => {
    expect(mapAmenityToSlug("Wi-Fi")).toBe("wifi");
    expect(mapAmenityToSlug("Kitchen access")).toBe("kitchen-access");
    expect(mapAmenityToSlug("Rooftop pool")).toBeNull();
    const d = baseDraft();
    d.space.amenities = ["Wi-Fi", "Wi-Fi", "Rooftop pool"];
    expect(describeAmenities(d)).toEqual({
      slugs: ["wifi"],
      unknownLabels: ["Rooftop pool"],
    });
  });

  it("never sends amenity_slugs; omits amenity_ids without a catalog", () => {
    const d = baseDraft();
    d.space.amenities = ["Wi-Fi", "Parking"];
    const u = serializeUnit(d);
    expect(u).not.toHaveProperty("amenity_slugs");
    expect(u).not.toHaveProperty("amenity_ids");
  });

  it("sends amenity_ids (never slugs) when a catalog is supplied", () => {
    const d = baseDraft();
    d.space.amenities = ["Wi-Fi", "Wi-Fi", "Parking", "Rooftop pool"];
    const catalog = [
      { id: 4, slug: "parking" },
      { id: 1, slug: "wifi" },
    ];
    const u = serializeUnit(d, catalog);
    expect(u).not.toHaveProperty("amenity_slugs");
    expect(u.amenity_ids).toEqual([1, 4]);
  });

  it("resolveAmenityIds never invents ids and reports missing slugs", () => {
    const catalog = [{ id: 2, slug: "wifi" }];
    expect(resolveAmenityIds(["wifi", "wifi"], catalog)).toEqual({
      ids: [2],
      missing: [],
    });
    expect(resolveAmenityIds(["wifi", "sauna"], catalog)).toEqual({
      ids: [2],
      missing: ["sauna"],
    });
    expect(resolveAmenityIds(["wifi"], [])).toEqual({ ids: [], missing: ["wifi"] });
    // Catalog rows with non-positive-integer ids resolve to missing, not garbage.
    expect(
      resolveAmenityIds(["wifi"], [{ id: 0, slug: "wifi" }])
    ).toEqual({ ids: [], missing: ["wifi"] });
    expect(
      resolveAmenityIds(["wifi"], [{ id: -3, slug: "wifi" }])
    ).toEqual({ ids: [], missing: ["wifi"] });
  });

  it("maps placeName to property name, trimmed, independent of the title", () => {
    const d = baseDraft();
    d.place.placeName = "  Green View House  ";
    d.listing.title = "Private room near ADTU";
    const p = serializeProperty(d);
    expect(p.name).toBe("Green View House");
    // Listing.title serialization is untouched by the property name.
    expect(d.listing.title).toBe("Private room near ADTU");
    expect(serializeListing(d, 20).title).toBe("Private room near ADTU");
  });

  it("maps blank placeName to null", () => {
    expect(serializeProperty(baseDraft()).name).toBeNull();
    const d = baseDraft();
    d.place.placeName = "   ";
    expect(serializeProperty(d).name).toBeNull();
  });

  it("maps independence and food status verbatim", () => {
    const d = baseDraft();
    d.space.independent = true;
    d.space.pgFood = "separate";
    const u = serializeUnit(d);
    expect(u.is_independent).toBe(true);
    expect(u.food_status).toBe("SEPARATE");
    expect(serializeUnit(baseDraft()).food_status).toBeNull();
  });
});

describe("property mapping", () => {
  it("passes ids through and blanks to null", () => {
    const d = baseDraft();
    d.place.area = { id: 7, type: "area", name: "Beltola", city: "Guwahati" };
    d.place.college = { id: 3, type: "college", name: "Cotton", city: "Guwahati" };
    d.place.locality = "  ";
    d.place.pincode = "781028";
    const p = serializeProperty(d);
    expect(p.property_type).toBe("PG");
    expect(p.address_line).toBe("12 Test Road");
    expect(p.locality).toBeNull();
    expect(p.area_location_id).toBe(7);
    expect(p.city).toBe("Guwahati");
    expect(p.pincode).toBe("781028");
    expect(p.nearest_college_id).toBe(3);
    expect(p.nearest_workplace_id).toBeNull();
    expect(p.is_independent).toBeNull();
  });

  it("maps a custom area when no canonical area is selected", () => {
    const d = baseDraft();
    d.place.area = null;
    d.place.areaCustomName = "  Jyotikuchi  ";
    const p = serializeProperty(d);
    expect(p.area_location_id).toBeNull();
    expect(p.area_custom_name).toBe("Jyotikuchi");
  });

  it("canonical area wins over custom text", () => {
    const d = baseDraft();
    d.place.area = { id: 7, type: "area", name: "Beltola", city: "Guwahati" };
    d.place.areaCustomName = "Jyotikuchi";
    const p = serializeProperty(d);
    expect(p.area_location_id).toBe(7);
    expect(p.area_custom_name).toBeNull();
  });

  it("maps blank custom area to null", () => {
    const d = baseDraft();
    d.place.area = null;
    d.place.areaCustomName = "   ";
    const p = serializeProperty(d);
    expect(p.area_location_id).toBeNull();
    expect(p.area_custom_name).toBeNull();
  });

  it("encodes the approved curfew combinations", () => {
    const yes = baseDraft();
    yes.space.pgCurfew = true;
    yes.place.gateTime = "22:00";
    expect(serializeProperty(yes)).toMatchObject({
      has_curfew: true,
      gate_closing_time: "22:00",
    });
    const no = baseDraft();
    no.space.pgCurfew = false;
    no.place.gateTime = "22:00";
    // FALSE + time would 422: the serializer drops the stray time.
    expect(serializeProperty(no)).toMatchObject({
      has_curfew: false,
      gate_closing_time: null,
    });
    expect(serializeProperty(baseDraft())).toMatchObject({
      has_curfew: null,
      gate_closing_time: null,
    });
  });
});

describe("listing mapping", () => {
  it("folds free-text overflow into the description", () => {
    const d = baseDraft();
    d.space.kind = "other";
    d.space.detail = "Shop shutter";
    d.place.buildingType = "OTHER";
    d.place.buildingOther = "Farmhouse";
    d.listing.title = "  Nice place  ";
    d.listing.description = "";
    const l = serializeListing(d, 42);
    expect(l.rental_unit_id).toBe(42);
    expect(l.title).toBe("Nice place");
    expect(l.description).toBe("Shop shutter\n\nFarmhouse");
    expect(l.rent_basis).toBe("PER_PERSON");
    expect(l.availability_status).toBe("AVAILABLE_NOW");
    expect(l.available_from).toBeNull();
  });

  it("keeps an existing description first", () => {
    const d = baseDraft();
    d.listing.description = "Sunny rooms.";
    const l = serializeListing(d, 1);
    expect(l.description).toBe("Sunny rooms.");
  });

  it("maps availability modes", () => {
    const d = baseDraft();
    d.availability.mode = "from";
    d.availability.date = "2026-10-01";
    expect(serializeListing(d, 1).availability_status).toBe("AVAILABLE_FROM_DATE");
    expect(serializeListing(d, 1).available_from).toBe("2026-10-01");
    expect(serializeAvailability({ mode: "occupied", date: "" })).toEqual({
      availability_status: "OCCUPIED",
      available_from: null,
    });
    expect(serializeAvailability({ mode: "now", date: "" })).toEqual({
      availability_status: "AVAILABLE_NOW",
      available_from: null,
    });
  });

  it("maps rent basis values", () => {
    expect(mapRentBasis("person")).toBe("PER_PERSON");
    expect(mapRentBasis("room")).toBe("PER_ROOM");
    expect(mapRentBasis("place")).toBe("PER_UNIT");
    expect(mapRentBasis("")).toBe("PER_PERSON");
  });
});

describe("G4 — price components and C-rule compatibility", () => {
  function priced(): ListingDraft {
    const d = baseDraft();
    d.pricing.rent = "8000";
    d.pricing.rentBasis = "person";
    d.pricing.deposit = "10000";
    return d;
  }

  it("builds a C6-compatible RENT row with matching basis", () => {
    const rows = serializePriceComponents(priced());
    const rent = rows.find((r) => r.charge_type === "RENT")!;
    expect(rent.amount_paise).toBe(800000);
    expect(rent.calculation_basis).toBe("PER_PERSON");
    expect(rent.billing_frequency).toBe("MONTHLY");
    expect(rent.variability).toBe("FIXED");
    expect(rent.mandatory).toBe(true);
    expect(rent.rate_paise_per_unit).toBeNull();
    expect(rent.payment_timing).toBe("PER_PERIOD");
  });

  it("builds a C5/C7-compatible DEPOSIT row", () => {
    const rows = serializePriceComponents(priced());
    const deposit = rows.find((r) => r.charge_type === "DEPOSIT")!;
    expect(deposit.amount_paise).toBe(1000000);
    expect(deposit.billing_frequency).toBe("ONE_TIME");
    expect(deposit.variability).toBe("FIXED");
    expect(deposit.refundable).toBe(true);
    expect(deposit.payment_timing).toBe("UPFRONT_FULL");
  });

  it("keeps food fact and FOOD charge independent", () => {
    const d = priced();
    d.space.pgFood = "included";
    // No FOOD row is created automatically.
    expect(serializePriceComponents(d).some((r) => r.charge_type === "FOOD")).toBe(false);
    d.pricing.extras = [
      { id: "e1", kind: "food", label: "", amount: "2500", frequency: "monthly", metered: false, rate: "", mandatory: true, included: true },
    ];
    const rows = serializePriceComponents(d);
    const food = rows.find((r) => r.charge_type === "FOOD")!;
    expect(food.amount_paise).toBe(250000);
    expect(food.billing_frequency).toBe("MONTHLY");
    expect(food.payment_timing).toBe("PER_PERIOD");
  });

  it("maps metered rows to CONSUMPTION with per-kind consumption units", () => {
    const d = priced();
    d.pricing.extras = [
      { id: "e1", kind: "electricity", label: "", amount: "500", frequency: "metered", metered: true, rate: "8", mandatory: true, included: false },
    ];
    const rows = serializePriceComponents(d);
    const elec = rows.find((r) => r.charge_type === "ELECTRICITY")!;
    // C1 XOR holds even though the draft row also carries an amount.
    expect(elec.amount_paise).toBeNull();
    expect(elec.rate_paise_per_unit).toBe(800);
    expect(elec.calculation_basis).toBe("CONSUMPTION");
    expect(elec.variability).toBe("VARIABLE");
    expect(elec.billing_frequency).toBe("USAGE_BASED");
    expect(elec.consumption_unit).toBe("kWh");
    expect(CONSUMPTION_UNIT_BY_KIND["water"]).toBe("kilolitre");
  });

  it("maps yearly to ANNUALLY and labels OTHER rows", () => {
    const d = priced();
    d.pricing.extras = [
      { id: "e1", kind: "maintenance", label: "", amount: "12000", frequency: "yearly", metered: false, rate: "", mandatory: true, included: false },
      { id: "e2", kind: "other", label: "Cleaning", amount: "500", frequency: "once", metered: false, rate: "", mandatory: false, included: false },
    ];
    const rows = serializePriceComponents(d);
    const maint = rows.find((r) => r.charge_type === "MAINTENANCE")!;
    expect(maint.billing_frequency).toBe("ANNUALLY");
    expect(maint.payment_timing).toBe("PER_PERIOD");
    const other = rows.find((r) => r.charge_type === "OTHER")!;
    expect(other.label).toBe("Cleaning");
    expect(other.payment_timing).toBe("UPFRONT_FULL");
  });

  it("skips invalid rows instead of emitting C-violating payloads", () => {
    const d = priced();
    d.pricing.extras = [
      { id: "e1", kind: "water", label: "", amount: "", frequency: "monthly", metered: false, rate: "", mandatory: true, included: true },
      { id: "e2", kind: "internet", label: "", amount: "999", frequency: "monthly", metered: true, rate: "", mandatory: true, included: true },
    ];
    const kinds = serializePriceComponents(d).map((r) => r.charge_type);
    expect(kinds).not.toContain("WATER");
    expect(kinds).not.toContain("INTERNET");
  });

  it("assigns ascending display_order", () => {
    const rows = serializePriceComponents(priced());
    expect(rows.map((r) => r.display_order)).toEqual([0, 1]);
  });
});

describe("payload schema conformance (M1 — the C1 bug class)", () => {
  // Allowlisted keys per endpoint. Catches invented keys (e.g. a future
  // amenity_slugs regression) without duplicating backend validation.
  const UNIT_KEYS = [
    "alcohol_allowed",
    "bathrooms",
    "capacity",
    "carpet_area_sqft",
    "couple_friendly",
    "floor_number",
    "food_status",
    "furnishing",
    "gender_scope",
    "house_rules",
    "is_independent",
    "layout",
    "occupancy_type",
    "pets_allowed",
    "sharing",
    "smoking_allowed",
    "unit_type",
    "visitors_allowed",
  ];
  const PROPERTY_KEYS = [
    "address_line",
    "area_custom_name",
    "area_location_id",
    "city",
    "gate_closing_time",
    "has_curfew",
    "is_independent",
    "locality",
    "name",
    "nearest_college_id",
    "nearest_workplace_id",
    "pincode",
    "property_type",
  ];
  const LISTING_KEYS = [
    "availability_status",
    "available_from",
    "description",
    "rent_basis",
    "rental_unit_id",
    "title",
  ];

  it("unit payload carries exactly the backend-accepted keys", () => {
    const withoutCatalog = serializeUnit(baseDraft());
    expect(Object.keys(withoutCatalog).sort()).toEqual(UNIT_KEYS);
    const withCatalog = serializeUnit(baseDraft(), [{ id: 1, slug: "wifi" }]);
    expect(Object.keys(withCatalog).sort()).toEqual(
      [...UNIT_KEYS, "amenity_ids"].sort()
    );
  });

  it("unit payload always carries the required (NOT NULL) fields", () => {
    for (const kind of ["single", "shared", "pg_bed", "bhk2", "other"] as const) {
      const d = baseDraft();
      d.space.kind = kind;
      if (kind === "shared") d.space.beds = 2;
      const u = serializeUnit(d);
      expect(u.unit_type).toMatch(
        /^(PRIVATE_ROOM|SHARED_ROOM_BED|PG_BED|ENTIRE_FLAT|OTHER)$/
      );
      // furnishing/gender_scope are backend NOT NULL: validated drafts map
      // them to enum literals, never null.
      expect(["UNFURNISHED", "SEMI_FURNISHED", "FURNISHED"]).toContain(
        u.furnishing
      );
      expect(["ANY", "MALE", "FEMALE"]).toContain(u.gender_scope);
    }
  });

  it("property payload carries exactly the backend-accepted keys", () => {
    const d = baseDraft();
    d.place.area = { id: 7, type: "area", name: "Beltola", city: "Guwahati" };
    expect(Object.keys(serializeProperty(d)).sort()).toEqual(PROPERTY_KEYS);
  });

  it("property_type and curfew use backend literals", () => {
    const d = baseDraft();
    expect(
      ["PG", "HOSTEL", "APARTMENT_FLAT", "INDEPENDENT_HOUSE", "ASSAM_TYPE_HOUSE", "STUDIO_BUILDING", "OTHER"]
    ).toContain(serializeProperty(d).property_type);
    d.space.pgCurfew = true;
    d.place.gateTime = "22:00";
    const pg = serializeProperty(d);
    expect(pg.has_curfew).toBe(true);
    expect(pg.gate_closing_time).toBe("22:00");
  });

  it("listing payload carries exactly the backend-accepted keys", () => {
    const d = baseDraft();
    d.listing.title = "Sunny PG near campus";
    d.pricing.rentBasis = "room";
    d.availability.mode = "from";
    d.availability.date = "2026-12-01";
    const l = serializeListing(d, 20);
    expect(Object.keys(l).sort()).toEqual(LISTING_KEYS);
    expect(l.rental_unit_id).toBe(20);
    expect(l.rent_basis).toBe("PER_ROOM");
    expect(l.availability_status).toBe("AVAILABLE_FROM_DATE");
    expect(l.available_from).toBe("2026-12-01");
  });

  it("rent-basis and audience enums cover every wizard option", () => {
    expect(mapRentBasis("person")).toBe("PER_PERSON");
    expect(mapRentBasis("room")).toBe("PER_ROOM");
    expect(mapRentBasis("place")).toBe("PER_UNIT");
    expect(mapRentBasis("")).toBe("PER_PERSON");
    expect(mapAudience("Men")).toBe("MALE");
    expect(mapAudience("Women")).toBe("FEMALE");
    expect(mapAudience("Anyone")).toBe("ANY");
    expect(mapAudience("")).toBe("ANY");
    expect(mapFurnishing("")).toBeNull();
  });
});

describe("photo upload plan (no network)", () => {
  it("orders cover first and assigns display order", () => {
    const plan = planPhotoUploads([
      { id: "a", cover: false, order: 0 },
      { id: "b", cover: true, order: 1 },
      { id: "c", cover: false, order: 2 },
    ]);
    expect(plan).toEqual([
      { localId: "b", displayOrder: 0, isCover: true },
      { localId: "a", displayOrder: 1, isCover: false },
      { localId: "c", displayOrder: 2, isCover: false },
    ]);
  });

  it("returns an empty plan for no photos", () => {
    expect(planPhotoUploads([])).toEqual([]);
  });
});
