import { describe, expect, it } from "vitest";
import {
  budgetPaise,
  detailCoverPhoto,
  displayAvailability,
  displayLocation,
  displayPriceRow,
  displayPropertyType,
  displayRentBasis,
  displayUnitLine,
  formatPaise,
  monthlyPrice,
  parseBudgetRupees,
  policyFacts,
} from "./public-listing-view";
import type {
  PublicListingSummary,
  PublicPhoto,
  PublicPriceComponent,
  PublicProperty,
  PublicUnit,
} from "./public-listings";

function property(overrides: Partial<PublicProperty> = {}): PublicProperty {
  return {
    name: "Green View PG",
    property_type: "PG",
    locality: "Beltola",
    city: "Guwahati",
    area_name: "Six Mile",
    ...overrides,
  };
}

function unit(overrides: Partial<PublicUnit> = {}): PublicUnit {
  return {
    unit_type: "SHARED_ROOM_BED",
    layout: null,
    occupancy_type: "DOUBLE",
    capacity: 2,
    sharing: "SHARED",
    furnishing: "FURNISHED",
    gender_scope: "ANY",
    bathrooms: 1,
    floor_number: null,
    carpet_area_sqft: null,
    couple_friendly: null,
    visitors_allowed: true,
    pets_allowed: null,
    smoking_allowed: false,
    alcohol_allowed: null,
    house_rules: null,
    amenities: ["Wi-Fi"],
    ...overrides,
  };
}

function summary(
  overrides: Partial<PublicListingSummary> = {}
): PublicListingSummary {
  return {
    id: 11,
    title: "Sunny PG near campus",
    description: null,
    rent_basis: "PER_PERSON",
    status: "PUBLISHED",
    availability_status: "AVAILABLE_NOW",
    available_from: null,
    monthly_total_paise: 800000,
    has_variable_charges: false,
    has_usage_charges: false,
    has_optional_charges: false,
    has_one_time_charges: false,
    property: property(),
    unit: unit(),
    cover_photo: {
      id: 90,
      display_order: 0,
      is_cover: true,
      view_url: "https://photos.test/cover",
    },
    photo_count: 2,
    ...overrides,
  };
}

function priceRow(
  overrides: Partial<PublicPriceComponent> = {}
): PublicPriceComponent {
  return {
    id: 31,
    charge_type: "MAINTENANCE",
    label: null,
    calculation_basis: "PER_PERSON",
    billing_frequency: "MONTHLY",
    variability: "FIXED",
    amount_paise: 50000,
    rate_paise_per_unit: null,
    consumption_unit: null,
    mandatory: true,
    included_in_advertised: true,
    refundable: false,
    payment_timing: "PER_PERIOD",
    display_order: 1,
    ...overrides,
  };
}

function photo(overrides: Partial<PublicPhoto> = {}): PublicPhoto {
  return {
    id: 90,
    display_order: 0,
    is_cover: false,
    view_url: "https://photos.test/90",
    ...overrides,
  };
}

describe("public listing labels", () => {
  it("maps unit, property, rent, availability, and location values", () => {
    expect(displayUnitLine(unit())).toBe("Shared room · 2 beds · Co-ed");
    expect(displayUnitLine(unit({ layout: "2 BHK", unit_type: "ENTIRE_FLAT" }))).toBe(
      "2 BHK · Co-ed"
    );
    expect(displayUnitLine(unit({ unit_type: "UNKNOWN_KIND" }))).toContain(
      "UNKNOWN_KIND"
    );
    expect(displayPropertyType("ASSAM_TYPE_HOUSE")).toBe("Assam-type house");
    expect(displayRentBasis("PER_PERSON")).toBe("per person");
    expect(displayAvailability("AVAILABLE_NOW", null)).toBe("Available now");
    expect(displayAvailability("AVAILABLE_FROM_DATE", "2026-11-01")).toBe(
      "Available from 1 Nov 2026"
    );
    expect(displayAvailability("OCCUPIED", null)).toBe("Currently full");
    expect(displayLocation(property())).toBe("Beltola, Guwahati · Six Mile");
    expect(
      displayLocation(property({ locality: null, city: "Guwahati", area_name: null }))
    ).toBe("Guwahati");
  });
});

describe("public monthly pricing", () => {
  it("formats whole and fractional paise without inventing precision", () => {
    expect(formatPaise(800000)).toBe("₹8,000");
    expect(formatPaise(800050)).toBe("₹8,000.50");
    expect(formatPaise(null)).toBeNull();
    expect(formatPaise(-1)).toBeNull();
  });

  it("labels exact totals and additional charges honestly", () => {
    expect(monthlyPrice(summary())).toEqual({
      prefix: "",
      amount: "₹8,000",
      suffix: "/month",
      unavailableLabel: null,
      note: null,
    });
    expect(
      monthlyPrice(
        summary({
          has_variable_charges: true,
          has_usage_charges: true,
          has_optional_charges: true,
          has_one_time_charges: true,
        })
      )
    ).toEqual({
      prefix: "from ",
      amount: "₹8,000",
      suffix: "/month",
      unavailableLabel: null,
      note: "Plus variable charges, usage-based charges, optional extras, one-time charges.",
    });
    expect(monthlyPrice(summary({ monthly_total_paise: null }))).toEqual({
      prefix: "",
      amount: null,
      suffix: null,
      unavailableLabel: "Monthly total unavailable",
      note: "The monthly baseline cannot be calculated from this listing's current price rows. Open the details for every listed charge.",
    });
  });

  it("describes fixed, optional, refundable, and rate-based rows", () => {
    expect(displayPriceRow(priceRow())).toEqual({
      label: "Maintenance · monthly",
      amount: "₹500",
    });
    expect(
      displayPriceRow(
        priceRow({
          charge_type: "OTHER",
          label: "Cleaning",
          mandatory: false,
          refundable: true,
        })
      )
    ).toEqual({
      label: "Cleaning · monthly · optional · refundable",
      amount: "₹500",
    });
    expect(
      displayPriceRow(
        priceRow({
          charge_type: "ELECTRICITY",
          calculation_basis: "CONSUMPTION",
          billing_frequency: "USAGE_BASED",
          variability: "VARIABLE",
          amount_paise: null,
          rate_paise_per_unit: 900,
          consumption_unit: "kWh",
        })
      )
    ).toEqual({
      label: "Electricity · metered",
      amount: "₹9 per kWh",
    });
  });
});

describe("public photo selection", () => {
  it("prefers an explicit cover, then lowest order and ID", () => {
    const photos = [
      photo({ id: 3, display_order: 1, is_cover: true }),
      photo({ id: 2, display_order: 0 }),
      photo({ id: 1, display_order: 0 }),
    ];
    expect(detailCoverPhoto(photos)?.id).toBe(3);
    expect(
      detailCoverPhoto(photos.map((item) => ({ ...item, is_cover: false })))?.id
    ).toBe(1);
    expect(detailCoverPhoto([])).toBeNull();
  });
});

describe("public browse filters", () => {
  it("parses whole-rupee budgets and converts them to paise", () => {
    expect(parseBudgetRupees("")).toEqual({ rupees: null, error: null });
    expect(parseBudgetRupees("8,000")).toEqual({ rupees: 8000, error: null });
    expect(parseBudgetRupees("zero").error).toMatch(/whole-rupee/);
    expect(budgetPaise(8000)).toBe(800000);
    expect(budgetPaise(null)).toBeNull();
    expect(budgetPaise(0)).toBeNull();
  });
});

describe("public house policies", () => {
  it("labels every supported policy in both states", () => {
    expect(
      policyFacts(
        unit({
          couple_friendly: true,
          visitors_allowed: false,
          pets_allowed: true,
          smoking_allowed: false,
          alcohol_allowed: true,
        })
      )
    ).toEqual([
      "Couples welcome",
      "Visitors not allowed",
      "Pets allowed",
      "Smoking not allowed",
      "Alcohol allowed",
    ]);
  });

  it("omits unknown policies without inventing a label", () => {
    expect(
      policyFacts(
        unit({
          couple_friendly: null,
          visitors_allowed: null,
          pets_allowed: null,
          smoking_allowed: null,
          alcohol_allowed: null,
        })
      )
    ).toEqual([]);
  });
});
