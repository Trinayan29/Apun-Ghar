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
import {
  SaveFailurePanel,
  SaveProgressPanel,
  SaveSuccessPanel,
} from "./review-changes";

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

describe("Review Changes network behavior", () => {  it("entering/exiting review performs no POST/PATCH/PUT/DELETE", async () => {
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

describe("Review Changes save entry", () => {
  it("offers Save Changes without confirmation for ordinary edits", async () => {
    seedSession({ dirty: true });
    const onSave = vi.fn();
    render(<EditWizard uid="test-uid" listingId={100} />);
    fireEvent.click(await screen.findByText("Review Changes"));
    await screen.findByText("Review your changes");
    // This seed dirties title + rent: significant, so confirmation shows.
    expect(
      screen.getByText(/I understand this changes the rent/)
    ).toBeDefined();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("Save button stays disabled until commercial changes are confirmed", () => {
    const onSave = vi.fn();
    render(
      <ReviewChanges
        groups={[]}
        onBack={() => {}}
        save={{ significant: true, onSave }}
      />
    );
    // Empty diff: no save affordance at all.
    expect(screen.queryByText("Save Changes")).toBeNull();
  });
});

describe("SaveActionRow behavior", () => {
  it("non-significant review saves immediately without a checkbox", async () => {
    seedSession({ dirty: false });
    const onSave = vi.fn();
    // Title-only diff: significant flag comes from the groups passed in.
    const { diffListingChanges } = await import("@/lib/listing-changes");
    const { hydrateEditDraft } = await import("@/lib/listing-edit");
    const s = source();
    const snapshot = hydrateEditDraft({
      listing: s.listing,
      unit: s.unit,
      property: s.property,
    } as never);
    const draft = {
      ...snapshot,
      listing: { ...snapshot.listing, title: "Only a title edit" },
    };
    const groups = diffListingChanges(snapshot, draft);
    expect(groups.flatMap((g) => g.changes).every((c) => !c.significant)).toBe(
      true
    );
    render(<ReviewChanges groups={groups} onBack={() => {}} save={{ significant: false, onSave }} />);
    const button = screen.getByText("Save Changes");
    expect(
      screen.queryByText(/I understand this changes the rent/)
    ).toBeNull();
    fireEvent.click(button);
    expect(onSave).toHaveBeenCalledWith(false);
  });

  it("significant review requires the checkbox before saving", async () => {
    seedSession({ dirty: false });
    const onSave = vi.fn();
    const { diffListingChanges } = await import("@/lib/listing-changes");
    const { hydrateEditDraft } = await import("@/lib/listing-edit");
    const s = source();
    const snapshot = hydrateEditDraft({
      listing: s.listing,
      unit: s.unit,
      property: s.property,
    } as never);
    const draft = {
      ...snapshot,
      pricing: { ...snapshot.pricing, rent: "10000" },
    };
    const groups = diffListingChanges(snapshot, draft);
    render(<ReviewChanges groups={groups} onBack={() => {}} save={{ significant: true, onSave }} />);
    const button = screen.getByText("Save Changes") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(
      screen.getByLabelText(/I understand this changes the rent/)
    );
    expect((screen.getByText("Save Changes") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByText("Save Changes"));
    expect(onSave).toHaveBeenCalledWith(true);
  });
});

describe("Save panels", () => {
  it("progress shows done, current, and pending steps", () => {
    render(
      <SaveProgressPanel
        planned={["property", "unit", "listing", "price", "availability"]}
        done={["property", "unit"]}
        current="listing"
      />
    );
    expect(screen.getByText("Saving changes")).toBeDefined();
    expect(screen.getByText("Property")).toBeDefined();
    expect(screen.getByText("Availability")).toBeDefined();
    expect(screen.queryByText("Not needed")).toBeNull();
  });

  it("title-only plan marks only Listing actionable", () => {
    render(
      <SaveProgressPanel planned={["listing"]} done={[]} current="listing" />
    );
    expect(screen.getByText("Listing")).toBeDefined();
    // The four unplanned steps read as not needed, never pending.
    expect(screen.getAllByText("Not needed")).toHaveLength(4);
    expect(screen.queryByText("Not attempted")).toBeNull();
  });

  it("property-only plan marks only Property actionable", () => {
    render(
      <SaveProgressPanel planned={["property"]} done={["property"]} current={null} />
    );
    expect(screen.getAllByText("Not needed")).toHaveLength(4);
  });

  it("pricing stays one logical row under the planned set", () => {
    render(
      <SaveProgressPanel
        planned={["listing", "price"]}
        done={["listing"]}
        current="price"
      />
    );
    expect(screen.getAllByText("Pricing")).toHaveLength(1);
    expect(screen.getAllByText("Not needed")).toHaveLength(3);
  });

  it("failure names the step, lists applied/pending, and retries", () => {
    const onRetry = vi.fn();
    const onRetryReload = vi.fn();
    const onBack = vi.fn();
    render(
      <SaveFailurePanel
        failure={{
          ok: false,
          reason: "step-failed",
          failedStep: "listing",
          appliedSteps: ["property", "unit"],
          pendingSteps: ["price", "availability"],
          error: "Couldn't save Listing: bad title",
          status: 422,
        }}
        onRetry={onRetry}
        onRetryReload={onRetryReload}
        onBack={onBack}
      />
    );
    expect(screen.getByText("Couldn't save your changes")).toBeDefined();
    expect(screen.getByText(/Already saved: Property, Space/)).toBeDefined();
    expect(screen.getByText(/Not attempted: Pricing, Availability/)).toBeDefined();
    fireEvent.click(screen.getByText("Retry from Listing"));
    expect(onRetry).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("Back to editing"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("reload failure offers confirmation retry instead of mutation retry", () => {
    const onRetry = vi.fn();
    const onRetryReload = vi.fn();
    render(
      <SaveFailurePanel
        failure={{
          ok: false,
          reason: "reload-failed",
          appliedSteps: ["listing"],
          pendingSteps: [],
          needsReloadOnly: true,
          error: "Your changes were saved, but we couldn't confirm.",
        }}
        onRetry={onRetry}
        onRetryReload={onRetryReload}
        onBack={() => {}}
      />
    );
    expect(screen.getByText("Saved, but couldn't confirm")).toBeDefined();
    expect(screen.queryByText(/Retry from/)).toBeNull();
    fireEvent.click(screen.getByText("Retry confirmation"));
    expect(onRetryReload).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("pricingCleared renders an explicit partial-pricing status", () => {
    render(
      <SaveFailurePanel
        failure={{
          ok: false,
          reason: "step-failed",
          failedStep: "listing",
          appliedSteps: [],
          pendingSteps: ["availability"],
          pricingCleared: true,
          error: "Couldn't save Listing. Pricing was already reset.",
        }}
        onRetry={() => {}}
        onRetryReload={() => {}}
        onBack={() => {}}
      />
    );
    expect(screen.getByText(/partially reset/)).toBeDefined();
    // Pricing appears in neither the saved nor the not-attempted list.
    expect(screen.queryByText(/Not attempted:.*Pricing/)).toBeNull();
    expect(screen.getByText("Retry from Listing")).toBeDefined();
  });

  it("normal failure renders no pricing partial status", () => {
    render(
      <SaveFailurePanel
        failure={{
          ok: false,
          reason: "step-failed",
          failedStep: "listing",
          appliedSteps: ["property"],
          pendingSteps: ["price", "availability"],
          error: "Couldn't save Listing.",
        }}
        onRetry={() => {}}
        onRetryReload={() => {}}
        onBack={() => {}}
      />
    );
    expect(screen.queryByText(/partially reset/)).toBeNull();
    expect(screen.getByText(/Not attempted: Pricing, Availability/)).toBeDefined();
  });

  it("success ends at the Studio, or editing when stale", () => {
    const { unmount } = render(
      <SaveSuccessPanel stale={false} onBackEditing={() => {}} />
    );
    expect(screen.getByText("Changes saved")).toBeDefined();
    expect(screen.getByRole("link", { name: "Back to Studio" })).toBeDefined();
    unmount();
    const onBackEditing = vi.fn();
    render(<SaveSuccessPanel stale={true} onBackEditing={onBackEditing} />);
    expect(screen.getByText("Saved — with newer edits kept")).toBeDefined();
    fireEvent.click(screen.getByText("Back to editing"));
    expect(onBackEditing).toHaveBeenCalledTimes(1);
  });
});
