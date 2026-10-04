/**
 * P2.3b curfew hydration fix: edit mode must represent existing server
 * curfew state (PG/HOSTEL) instead of always leaving it unset.
 */
import { describe, expect, it } from "vitest";
import {
  hydrateEditDraft,
  type EditSourceData,
} from "./listing-edit";

function source(property: Record<string, unknown>): EditSourceData {
  return {
    listing: {
      id: 100,
      rental_unit_id: 10,
      title: "Sunny PG near campus",
      description: null,
      rent_basis: "PER_PERSON",
      status: "PUBLISHED",
      availability_status: "AVAILABLE_NOW",
      available_from: null,
      price_components: [],
      photos: [],
      created_at: "2026-09-27T00:00:00Z",
    },
    unit: {
      id: 10,
      property_id: 1,
      unit_type: "PRIVATE_ROOM",
      layout: null,
      furnishing: "FURNISHED",
      gender_scope: "ANY",
    },
    property: {
      id: 1,
      property_type: "PG",
      name: "Green View House",
      address_line: "12 Test Road",
      locality: null,
      city: "Guwahati",
      pincode: null,
      area_location_id: null,
      area_custom_name: "Jyotikuchi",
      area_location: null,
      has_curfew: null,
      gate_closing_time: null,
      ...property,
    },
  } as unknown as EditSourceData;
}

describe("curfew hydration", () => {
  it("maps has_curfew and gate_closing_time for PG", () => {
    const draft = hydrateEditDraft(
      source({ has_curfew: true, gate_closing_time: "22:30:00" })
    );
    expect(draft.space.pgCurfew).toBe(true);
    expect(draft.place.gateTime).toBe("22:30");
  });

  it("maps an explicit curfew-off for HOSTEL", () => {
    const draft = hydrateEditDraft(
      source({
        property_type: "HOSTEL",
        has_curfew: false,
        gate_closing_time: null,
      })
    );
    expect(draft.space.pgCurfew).toBe(false);
    expect(draft.place.gateTime).toBe("");
  });

  it("leaves curfew unset when the server has none", () => {
    const draft = hydrateEditDraft(source({}));
    expect(draft.space.pgCurfew).toBeNull();
    expect(draft.place.gateTime).toBe("");
  });

  it("ignores curfew fields for non-PG buildings", () => {
    const draft = hydrateEditDraft(
      source({
        property_type: "APARTMENT_FLAT",
        has_curfew: true,
        gate_closing_time: "22:30:00",
      })
    );
    expect(draft.space.pgCurfew).toBeNull();
    expect(draft.place.gateTime).toBe("");
  });

  it("ignores malformed gate times instead of inventing one", () => {
    const draft = hydrateEditDraft(
      source({ has_curfew: true, gate_closing_time: "late evening" })
    );
    expect(draft.space.pgCurfew).toBe(true);
    expect(draft.place.gateTime).toBe("");
  });
});
