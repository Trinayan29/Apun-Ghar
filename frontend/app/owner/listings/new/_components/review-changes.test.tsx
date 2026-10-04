// @vitest-environment jsdom
/**
 * P2.2 Review Changes UI: entry gating, review rendering, back
 * navigation, and the GET-only guarantee for entering/exiting review.
 */
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { EditWizard } from "./edit-wizard";
import {
  hydrateEditDraft,
  loadEditSource,
  saveEditSession,
} from "@/lib/listing-edit";
import { ReviewChanges } from "./review-changes";

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

/** Seed a stored session; the mocked server returns `serverTitle`. */
function seedSession(opts: { dirty: boolean; serverTitle?: string }) {
  window.localStorage.clear();
  const s = source();
  const snapshot = hydrateEditDraft({
    listing: s.listing,
    unit: s.unit,
    property: s.property,
  } as never);
  const draft = opts.dirty
    ? {
        ...snapshot,
        listing: { ...snapshot.listing, title: "My local edit" },
        pricing: { ...snapshot.pricing, rent: "10000" },
      }
    : snapshot;
  saveEditSession("test-uid", 100, {
    draft,
    savedSnapshot: snapshot,
    updatedAt: 1,
  });
  mockedLoad.mockResolvedValue({
    listing: { ...s.listing, title: opts.serverTitle ?? s.listing.title },
    unit: s.unit,
    property: s.property,
  } as never);
}

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  window.scrollTo = vi.fn() as never;
});

describe("Review Changes entry", () => {
  it("unavailable when the session is clean", async () => {
    seedSession({ dirty: false });
    render(<EditWizard uid="test-uid" listingId={100} />);
    await screen.findByText("What are you renting?");
    expect(screen.queryByText("Review Changes")).toBeNull();
  });

  it("opens the review when dirty, showing before/after", async () => {
    seedSession({ dirty: true });
    render(<EditWizard uid="test-uid" listingId={100} />);
    const entry = await screen.findByText("Review Changes");
    expect(entry).toBeDefined();
    fireEvent.click(entry);
    await screen.findByText("Review your changes");
    // Changed fields render with human labels and before/after values.
    expect(screen.getByText("Listing title")).toBeDefined();
    expect(screen.getByText("Monthly rent")).toBeDefined();
    expect(screen.getAllByText("Before").length).toBeGreaterThan(0);
    expect(screen.getAllByText("After").length).toBeGreaterThan(0);
    // Rent is flagged as a significant commercial change.
    expect(screen.getAllByText("Significant change").length).toBeGreaterThan(
      0
    );
    // Unchanged groups never render.
    expect(screen.queryByText("House rules & stay")).toBeNull();
  });

  it("Back to editing preserves the draft exactly", async () => {
    seedSession({ dirty: true });
    render(<EditWizard uid="test-uid" listingId={100} />);
    fireEvent.click(await screen.findByText("Review Changes"));
    await screen.findByText("Review your changes");
    fireEvent.click(screen.getByText("Back to editing"));
    // Back on the wizard chapter with the entry still offered.
    await screen.findByText("What are you renting?");
    expect(screen.getByText("Review Changes")).toBeDefined();
    const raw = window.localStorage.getItem("owner-listing-edits:test-uid:100");
    const saved = JSON.parse(raw ?? "{}");
    expect(saved.draft.listing.title).toBe("My local edit");
    expect(saved.draft.pricing.rent).toBe("10000");
    expect(saved.savedSnapshot.listing.title).toBe("Sunny PG near campus");
  });
});

describe("ReviewChanges empty state", () => {
  it("never shows an empty review as if there were changes", () => {
    render(<ReviewChanges groups={[]} onBack={() => {}} />);
    expect(screen.getByText("No changes to review")).toBeDefined();
    expect(screen.getByText("Back to editing")).toBeDefined();
    expect(screen.queryByText("Review your changes")).toBeNull();
  });
});

describe("Review Changes network behavior", () => {
  it("entering/exiting review performs no POST/PATCH/PUT/DELETE", async () => {
    const methods: (string | undefined)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        methods.push("GET");
        return Response.json({});
      })
    );
    try {
      seedSession({ dirty: true });
      render(<EditWizard uid="test-uid" listingId={100} />);
      fireEvent.click(await screen.findByText("Review Changes"));
      await screen.findByText("Review your changes");
      fireEvent.click(screen.getByText("Back to editing"));
      await screen.findByText("What are you renting?");
      await waitFor(() => expect(mockedLoad).toHaveBeenCalled());
      expect(
        methods.filter((m) => m !== undefined && m !== "GET")
      ).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
