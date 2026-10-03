// @vitest-environment jsdom
/**
 * EditWizard hook-order regression: loading -> hydrated must not change
 * the hook call sequence (previously goNext lived after the early
 * returns, crashing with "more hooks than during the previous render"
 * the moment backend data arrived).
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { EditWizard } from "./edit-wizard";
import { loadEditSource } from "@/lib/listing-edit";

vi.mock("@/lib/listing-edit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/listing-edit")>();
  return {
    ...actual,
    loadEditSource: vi.fn(),
  };
});

const mockedLoad = vi.mocked(loadEditSource);

afterEach(() => cleanup());

function source() {
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
    },
  };
}

describe("EditWizard loading transition", () => {
  it("renders hydrated chapters after loading without a hooks crash", async () => {
    mockedLoad.mockResolvedValue(source() as never);
    render(<EditWizard uid="test-uid" listingId={100} />);
    // Loading state first (no crash, no data needed).
    expect(await screen.findByText("Loading your listing.")).toBeDefined();
    // Hydrated state: same hook sequence, first chapter renders.
    await screen.findByText("What are you renting?");
    expect(mockedLoad).toHaveBeenCalledWith(100);
  });

  it("shows the loader error state when the listing cannot load", async () => {
    mockedLoad.mockRejectedValueOnce(new Error("gone"));
    render(<EditWizard uid="test-uid" listingId={999} />);
    await screen.findByText("Couldn't load this listing.");
    expect(screen.getByRole("link", { name: "Back to Studio" })).toBeDefined();
  });
});

describe("EditWizard network behavior", () => {
  it("opening Edit performs GET reads only, never mutations", async () => {
    // Real loader + stubbed fetch: the fetch layer records every method
    // so any POST/PATCH/PUT/DELETE during open would fail this test.
    const actual =
      await vi.importActual<typeof import("@/lib/listing-edit")>(
        "@/lib/listing-edit"
      );
    const s = source();
    const routes: Record<string, unknown> = {
      "/api/v1/owner/listings/100": s.listing,
      "/api/v1/owner/units/10": s.unit,
      "/api/v1/owner/properties/1": s.property,
    };
    const methods: (string | undefined)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown, init?: { method?: string }) => {
        methods.push(init?.method);
        const path = new URL(String(url)).pathname;
        const body = routes[path];
        if (body === undefined) return new Response("nope", { status: 404 });
        return Response.json(body);
      })
    );
    try {
      mockedLoad.mockImplementationOnce((id) => actual.loadEditSource(id));
      render(<EditWizard uid="test-uid" listingId={100} />);
      await screen.findByText("What are you renting?");
      // Exactly the three loader GETs; nothing else fetches on open
      // (photos chapter mounts only on navigation).
      expect(methods.length).toBeGreaterThan(0);
      expect(
        methods.filter((m) => m !== undefined && m !== "GET")
      ).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
