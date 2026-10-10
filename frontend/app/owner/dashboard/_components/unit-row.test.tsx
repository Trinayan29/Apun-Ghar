// @vitest-environment jsdom
/**
 * Tests for delete affordance on Your Places unit rows (Phase 2.2).
 * Delete appears only for genuinely DRAFT listings; the action itself
 * is injected. ListingLifecycleAction is real but never activated here.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { UnitRow } from "./unit-row";
import type { DeleteDraftOutcome } from "@/lib/draft-delete";
import type { StudioUnit } from "@/lib/studio-data";

afterEach(() => {
  cleanup();
});

function listing(overrides: Record<string, unknown> = {}) {
  return {
    id: 100,
    title: "Listing 100",
    description: null,
    rentBasis: "PER_PERSON",
    lifecycle: "DRAFT",
    availability: { status: "AVAILABLE_NOW", availableFrom: null },
    rent: null,
    priceComponents: [],
    photoCount: 0,
    ...overrides,
  };
}

function unitRowUnit(lifecycle: string | null): StudioUnit {
  return {
    id: 10,
    propertyId: 1,
    unitType: "PRIVATE_ROOM",
    layout: null,
    displayKind: "Private room",
    listing:
      lifecycle === null
        ? null
        : (listing({ lifecycle }) as unknown as StudioUnit["listing"]),
  };
}

function renderRow(
  lifecycle: string | null,
  onDeleteListing?: (
    listingId: number,
    lifecycle: string
  ) => Promise<DeleteDraftOutcome>
) {
  return render(
    <UnitRow
      unit={unitRowUnit(lifecycle)}
      onListingChanged={() => {}}
      onEditListing={() => {}}
      onDeleteListing={onDeleteListing}
    />
  );
}

function ok(): DeleteDraftOutcome {
  return { type: "done", result: { ok: true, localOnly: false } };
}

describe("delete visibility", () => {
  it("shows Delete for a DRAFT listing while keeping Edit primary", () => {
    renderRow("DRAFT", async () => ok());
    expect(screen.getByRole("button", { name: "Edit Listing 100" })).toBeDefined();
    expect(
      screen.getByLabelText("More actions for Listing 100")
    ).toBeDefined();
  });

  it.each([["PUBLISHED"], ["PAUSED"], ["RENTED"], ["ARCHIVED"]])(
    "hides Delete for a %s listing",
    (lifecycle) => {
      renderRow(lifecycle, async () => ok());
      expect(
        screen.queryByLabelText("More actions for Listing 100")
      ).toBeNull();
      // Edit stays available for non-draft lifecycles.
      expect(
        screen.getByRole("button", { name: "Edit Listing 100" })
      ).toBeDefined();
    }
  );

  it("hides Delete when the unit has no listing", () => {
    renderRow(null, async () => ok());
    expect(
      screen.queryByLabelText("More actions for Listing 100")
    ).toBeNull();
  });

  it("hides Delete when no delete wiring is provided", () => {
    renderRow("DRAFT");
    expect(
      screen.queryByLabelText("More actions for Listing 100")
    ).toBeNull();
  });
});

describe("delete interaction", () => {
  function openConfirm() {
    fireEvent.click(screen.getByLabelText("More actions for Listing 100"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete draft" }));
    expect(screen.getByText("Delete this draft?")).toBeDefined();
  }

  it("opens the inline menu first, then the confirmation", () => {
    renderRow("DRAFT", async () => ok());
    fireEvent.click(screen.getByLabelText("More actions for Listing 100"));
    // The destructive confirmation must NOT appear yet.
    expect(screen.queryByText("Delete this draft?")).toBeNull();
    const menu = screen.getByRole("menu");
    // Normal flow, never absolutely positioned: safe inside the
    // property card's overflow-hidden.
    expect(menu.className).toMatch(/basis-full/);
    expect(menu.className).not.toMatch(/absolute/);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete draft" }));
    expect(screen.getByText("Delete this draft?")).toBeDefined();
  });

  it("Cancel leaves the row unchanged", () => {
    const onDeleteListing = vi.fn(async () => ok());
    renderRow("DRAFT", onDeleteListing);
    openConfirm();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Delete this draft?")).toBeNull();
    expect(onDeleteListing).not.toHaveBeenCalled();
    expect(screen.getByText("Listing 100")).toBeDefined();
  });

  it("invokes the callback with the listing id and lifecycle", async () => {
    const onDeleteListing = vi.fn(async () => ok());
    renderRow("DRAFT", onDeleteListing);
    openConfirm();
    fireEvent.click(screen.getByRole("button", { name: "Delete draft" }));
    await waitFor(() =>
      expect(onDeleteListing).toHaveBeenCalledTimes(1)
    );
    expect(onDeleteListing).toHaveBeenCalledWith(100, "DRAFT");
  });

  it("prevents a duplicate action while deleting", async () => {
    let resolveDelete!: (v: DeleteDraftOutcome) => void;
    const gate = new Promise<DeleteDraftOutcome>((resolve) => {
      resolveDelete = resolve;
    });
    const onDeleteListing = vi.fn(() => gate);
    renderRow("DRAFT", onDeleteListing);
    openConfirm();
    const button = screen.getByRole("button", { name: "Delete draft" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onDeleteListing).toHaveBeenCalledTimes(1);
    expect(
      (await screen.findByRole("button", { name: "Deleting…" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    resolveDelete(ok());
    await waitFor(() => expect(onDeleteListing).toHaveBeenCalledTimes(1));
  });

  it("keeps the row visible with an accessible error on failure", async () => {
    const onDeleteListing = vi.fn(
      async (): Promise<DeleteDraftOutcome> => ({
        type: "done",
        result: { ok: false, status: 503, error: "unavailable" },
      })
    );
    renderRow("DRAFT", onDeleteListing);
    openConfirm();
    fireEvent.click(screen.getByRole("button", { name: "Delete draft" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/photo storage/i);
    expect(screen.getByText("Listing 100")).toBeDefined();
    expect(screen.getByText("Delete this draft?")).toBeDefined();
  });

  it("retry works after failure", async () => {
    const onDeleteListing = vi
      .fn()
      .mockResolvedValueOnce({
        type: "done",
        result: { ok: false, status: undefined, error: "offline" },
      })
      .mockResolvedValueOnce(ok());
    renderRow(
      "DRAFT",
      onDeleteListing as (
        listingId: number,
        lifecycle: string
      ) => Promise<DeleteDraftOutcome>
    );
    openConfirm();
    fireEvent.click(screen.getByRole("button", { name: "Delete draft" }));
    const retry = await screen.findByRole("button", { name: "Try again" });
    fireEvent.click(retry);
    await waitFor(() => expect(onDeleteListing).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByText("Delete this draft?")).toBeNull()
    );
  });
});
