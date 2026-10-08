// @vitest-environment jsdom
/**
 * Tests for the DraftCard overflow menu + delete confirmation (Phase 2.1).
 * The delete action is injected as a callback; no API, store, or router.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DraftCard } from "./draft-card";
import type { DeleteDraftOutcome } from "@/lib/draft-delete";
import type { StudioDraft } from "@/lib/studio-data";

afterEach(() => {
  cleanup();
});

function studioDraft(overrides: Partial<StudioDraft> = {}): StudioDraft {
  return {
    draftId: "d1",
    title: "Draft d1",
    updatedAt: Date.now(),
    currentChapter: "what",
    furthestChapter: "what",
    kind: "local",
    backendIds: { propertyId: null, unitId: null, listingId: null },
    linkedLifecycle: null,
    progress: { price: false, availability: false },
    remainingSteps: [],
    ...overrides,
  };
}

function linked(lifecycle: string | null): StudioDraft {
  return studioDraft({
    kind: "pending",
    backendIds: { propertyId: 1, unitId: 10, listingId: 30 },
    linkedLifecycle: lifecycle,
  });
}

function renderCard(
  draft: StudioDraft,
  onDelete?: (draft: StudioDraft) => Promise<DeleteDraftOutcome>
) {
  return render(<DraftCard draft={draft} onDelete={onDelete} />);
}

function openConfirm() {
  fireEvent.click(screen.getByLabelText("More actions for Draft d1"));
  fireEvent.click(screen.getByRole("menuitem", { name: "Delete draft" }));
}

describe("delete menu visibility", () => {
  it("shows the overflow menu for a local-only draft", () => {
    renderCard(studioDraft(), async () => ({
      type: "done",
      result: { ok: true, localOnly: true },
    }));
    expect(
      screen.getByLabelText("More actions for Draft d1")
    ).toBeDefined();
  });

  it("shows the overflow menu for a linked DRAFT", () => {
    renderCard(linked("DRAFT"), async () => ({
      type: "done",
      result: { ok: true, localOnly: false },
    }));
    expect(
      screen.getByLabelText("More actions for Draft d1")
    ).toBeDefined();
  });

  it.each([["PUBLISHED"], ["PAUSED"], ["RENTED"], ["ARCHIVED"]])(
    "hides the overflow menu for a %s-linked draft",
    (lifecycle) => {
      renderCard(linked(lifecycle), async () => ({
        type: "done",
        result: { ok: true, localOnly: false },
      }));
      expect(
        screen.queryByLabelText("More actions for Draft d1")
      ).toBeNull();
    }
  );

  it("hides the overflow menu when the linked lifecycle is unknown", () => {
    renderCard(linked(null), async () => ({
      type: "done",
      result: { ok: true, localOnly: false },
    }));
    expect(screen.queryByLabelText("More actions for Draft d1")).toBeNull();
  });

  it("hides the overflow menu when no delete wiring is provided", () => {
    renderCard(studioDraft());
    expect(screen.queryByLabelText("More actions for Draft d1")).toBeNull();
    // Continue remains the primary action.
    expect(screen.getByRole("link", { name: "Continue Draft d1" })).toBeDefined();
  });
});

describe("menu interaction", () => {
  it("opens the menu with correct ARIA and closes on Escape", () => {
    renderCard(studioDraft(), async () => ({
      type: "done",
      result: { ok: true, localOnly: true },
    }));
    const button = screen.getByLabelText("More actions for Draft d1");
    expect(button.getAttribute("aria-haspopup")).toBe("menu");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(
      screen.getByRole("menuitem", { name: "Delete draft" })
    ).toBeDefined();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.queryByRole("menuitem", { name: "Delete draft" })
    ).toBeNull();
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes the menu on outside click", () => {
    renderCard(studioDraft(), async () => ({
      type: "done",
      result: { ok: true, localOnly: true },
    }));
    fireEvent.click(screen.getByLabelText("More actions for Draft d1"));
    expect(
      screen.getByRole("menuitem", { name: "Delete draft" })
    ).toBeDefined();
    fireEvent.pointerDown(document.body);
    expect(
      screen.queryByRole("menuitem", { name: "Delete draft" })
    ).toBeNull();
  });
});

describe("confirmation", () => {
  it("opens the confirmation and Cancel does nothing", () => {
    const onDelete = vi.fn(
      async (): Promise<DeleteDraftOutcome> => ({
        type: "done",
        result: { ok: true, localOnly: true },
      })
    );
    renderCard(studioDraft(), onDelete);
    openConfirm();
    expect(screen.getByText("Delete this draft?")).toBeDefined();
    expect(
      screen.getByText(/permanently remove your unfinished listing/i)
    ).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByText("Delete this draft?")
    ).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("calls the delete callback with the draft on confirm", async () => {
    const draft = studioDraft();
    const onDelete = vi.fn(
      async (): Promise<DeleteDraftOutcome> => ({
        type: "done",
        result: { ok: true, localOnly: true },
      })
    );
    renderCard(draft, onDelete);
    openConfirm();
    fireEvent.click(screen.getByRole("button", { name: "Delete draft" }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
    expect(onDelete).toHaveBeenCalledWith(draft);
  });

  it("ignores a same-tick double click", async () => {
    let resolveDelete!: (v: DeleteDraftOutcome) => void;
    const gate = new Promise<DeleteDraftOutcome>((resolve) => {
      resolveDelete = resolve;
    });
    const onDelete = vi.fn(() => gate);
    renderCard(studioDraft(), onDelete);
    openConfirm();
    const button = screen.getByRole("button", { name: "Delete draft" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onDelete).toHaveBeenCalledTimes(1);
    resolveDelete({ type: "done", result: { ok: true, localOnly: true } });
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
  });

  it("shows a disabled deleting state while in flight", async () => {
    let resolveDelete!: (v: DeleteDraftOutcome) => void;
    const gate = new Promise<DeleteDraftOutcome>((resolve) => {
      resolveDelete = resolve;
    });
    renderCard(studioDraft(), () => gate);
    openConfirm();
    fireEvent.click(screen.getByRole("button", { name: "Delete draft" }));
    const deleting = await screen.findByRole("button", {
      name: "Deleting…",
    });
    expect((deleting as HTMLButtonElement).disabled).toBe(true);
    resolveDelete({ type: "done", result: { ok: true, localOnly: true } });
    await waitFor(() =>
      expect(screen.queryByText("Delete this draft?")).toBeNull()
    );
  });

  it("keeps the card visible with an accessible error on failure", async () => {
    const onDelete = vi.fn(
      async (): Promise<DeleteDraftOutcome> => ({
        type: "done",
        result: { ok: false, status: 503, error: "unavailable" },
      })
    );
    renderCard(studioDraft(), onDelete);
    openConfirm();
    fireEvent.click(screen.getByRole("button", { name: "Delete draft" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/photo storage/i);
    // The card and its title are still visible; the draft was kept.
    expect(screen.getByText("Draft d1")).toBeDefined();
    expect(screen.getByText("Delete this draft?")).toBeDefined();
  });

  it("allows retry after failure", async () => {
    const onDelete: (draft: StudioDraft) => Promise<DeleteDraftOutcome> = vi
      .fn()
      .mockResolvedValueOnce({
        type: "done",
        result: { ok: false, status: undefined, error: "offline" },
      })
      .mockResolvedValueOnce({
        type: "done",
        result: { ok: true, localOnly: true },
      });
    renderCard(studioDraft(), onDelete);
    openConfirm();
    fireEvent.click(screen.getByRole("button", { name: "Delete draft" }));
    const retry = await screen.findByRole("button", { name: "Try again" });
    fireEvent.click(retry);
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByText("Delete this draft?")).toBeNull()
    );
  });

  it("surfaces a backend-side rejection without removing the card", async () => {
    const onDelete = vi.fn(
      async (): Promise<DeleteDraftOutcome> => ({ type: "not-deletable" })
    );
    renderCard(linked("DRAFT"), onDelete);
    openConfirm();
    fireEvent.click(screen.getByRole("button", { name: "Delete draft" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/no longer a draft/i);
    expect(screen.getByText("Draft d1")).toBeDefined();
  });
});
