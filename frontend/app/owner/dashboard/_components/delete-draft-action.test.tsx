// @vitest-environment jsdom
/**
 * Tests for the shared DeleteDraftAction (Phase 2.2). Covers both
 * presentations: the popover menu (DraftCard) and the inline menu
 * (UnitRow). Both run trigger → menu → confirmation; only the menu
 * positioning differs. Deletion itself is injected; no API or store.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DeleteDraftAction } from "./delete-draft-action";
import type { DeleteDraftOutcome } from "@/lib/draft-delete";

afterEach(() => {
  cleanup();
});

function ok(): DeleteDraftOutcome {
  return { type: "done", result: { ok: true, localOnly: false } };
}

function renderAction(
  presentation: "popover" | "inline",
  onDelete: () => Promise<DeleteDraftOutcome>
) {
  return render(
    <DeleteDraftAction label="Listing 100" presentation={presentation} onDelete={onDelete} />
  );
}

function openMenu() {
  fireEvent.click(screen.getByLabelText("More actions for Listing 100"));
  expect(screen.getByRole("menu")).toBeDefined();
}

function openConfirm() {
  openMenu();
  fireEvent.click(screen.getByRole("menuitem", { name: "Delete draft" }));
  expect(screen.getByText("Delete this draft?")).toBeDefined();
}

describe("popover presentation", () => {
  it("opens the menu with ARIA and closes on Escape with focus return", () => {
    renderAction("popover", async () => ok());
    const button = screen.getByLabelText("More actions for Listing 100");
    expect(button.getAttribute("aria-haspopup")).toBe("menu");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("menu")).toBeDefined();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("closes the menu on outside click", () => {
    renderAction("popover", async () => ok());
    fireEvent.click(screen.getByLabelText("More actions for Listing 100"));
    expect(screen.getByRole("menu")).toBeDefined();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("moves focus into the open menu", () => {
    renderAction("popover", async () => ok());
    fireEvent.click(screen.getByLabelText("More actions for Listing 100"));
    expect(document.activeElement).toBe(
      screen.getByRole("menuitem", { name: "Delete draft" })
    );
  });
});

describe("inline presentation", () => {
  it("opens a menu first, never the confirmation directly", () => {
    renderAction("inline", async () => ok());
    const button = screen.getByLabelText("More actions for Listing 100");
    expect(button.getAttribute("aria-haspopup")).toBe("menu");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    // The destructive confirmation must NOT appear yet.
    expect(screen.queryByText("Delete this draft?")).toBeNull();
    expect(screen.getByRole("menu")).toBeDefined();
    expect(
      screen.getByRole("menuitem", { name: "Delete draft" })
    ).toBeDefined();
  });

  it("renders the inline menu in normal flow outside the trigger wrapper", () => {
    renderAction("inline", async () => ok());
    const trigger = screen.getByLabelText("More actions for Listing 100");
    fireEvent.click(trigger);
    const menu = screen.getByRole("menu");
    expect(menu.className).toMatch(/basis-full/);
    expect(menu.className).not.toMatch(/absolute/);
    expect(trigger.parentElement!.contains(menu)).toBe(false);
  });

  it("opens the confirmation only after clicking Delete draft", () => {
    renderAction("inline", async () => ok());
    openMenu();
    expect(screen.queryByText("Delete this draft?")).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete draft" }));
    expect(screen.getByText("Delete this draft?")).toBeDefined();
  });

  it("moves focus into the open inline menu", () => {
    renderAction("inline", async () => ok());
    fireEvent.click(screen.getByLabelText("More actions for Listing 100"));
    expect(document.activeElement).toBe(
      screen.getByRole("menuitem", { name: "Delete draft" })
    );
  });

  it("opens the confirmation from a real pointerdown-then-click sequence", () => {
    // Browser regression pin: a real click is preceded by pointerdown.
    // The outside-click handler must treat the inline menu item as
    // inside, otherwise the menu unmounts before click fires and the
    // confirmation never opens. fireEvent.click alone cannot catch this.
    const onDelete = vi.fn(async (): Promise<DeleteDraftOutcome> => ok());
    renderAction("inline", onDelete);
    fireEvent.click(screen.getByLabelText("More actions for Listing 100"));
    const item = screen.getByRole("menuitem", { name: "Delete draft" });
    fireEvent.pointerDown(item);
    // The menu must survive pointerdown so the click can land on it.
    expect(screen.getByRole("menu")).toBeDefined();
    fireEvent.click(item);
    expect(screen.getByText("Delete this draft?")).toBeDefined();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("closes the inline menu on Escape with focus return", () => {
    renderAction("inline", async () => ok());
    const button = screen.getByLabelText("More actions for Listing 100");
    fireEvent.click(button);
    expect(screen.getByRole("menu")).toBeDefined();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("closes the inline menu on outside click", () => {
    renderAction("inline", async () => ok());
    fireEvent.click(screen.getByLabelText("More actions for Listing 100"));
    expect(screen.getByRole("menu")).toBeDefined();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes the confirmation on Escape with focus return", () => {
    renderAction("inline", async () => ok());
    const button = screen.getByLabelText("More actions for Listing 100");
    openConfirm();
    expect(screen.getByText("Delete this draft?")).toBeDefined();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Delete this draft?")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("does not dismiss the confirmation on outside click", () => {
    const onDelete = vi.fn(async (): Promise<DeleteDraftOutcome> => ok());
    renderAction("inline", onDelete);
    openConfirm();
    fireEvent.pointerDown(document.body);
    expect(screen.getByText("Delete this draft?")).toBeDefined();
    expect(onDelete).not.toHaveBeenCalled();
  });
});

describe("shared confirmation", () => {
  it.each([["popover"], ["inline"]] as const)(
    "renders the confirmation outside the trigger wrapper (%s)",
    (presentation) => {
      // Structural pin for the M1 layout fix: the panel must be a
      // sibling of the trigger wrapper (so it can take its own full
      // row), never nested inside it. jsdom cannot prove geometry;
      // this only guards the structure the layout depends on.
      renderAction(presentation, async () => ok());
      const trigger = screen.getByLabelText("More actions for Listing 100");
      fireEvent.click(trigger);
      fireEvent.click(
        screen.getByRole("menuitem", { name: "Delete draft" })
      );
      const panel = screen.getByText("Delete this draft?").parentElement!;
      expect(panel.className).toMatch(/basis-full/);
      expect(trigger.parentElement!.contains(panel)).toBe(false);
    }
  );

  it.each([["popover"], ["inline"]] as const)(
    "uses the exact confirmation copy (%s)",
    (presentation) => {
      renderAction(presentation, async () => ok());
      fireEvent.click(screen.getByLabelText("More actions for Listing 100"));
      fireEvent.click(
        screen.getByRole("menuitem", { name: "Delete draft" })
      );
      expect(screen.getByText("Delete this draft?")).toBeDefined();
      expect(
        screen.getByText(/permanently remove your unfinished listing/i)
      ).toBeDefined();
      expect(screen.getByRole("button", { name: "Cancel" })).toBeDefined();
      expect(
        screen.getByRole("button", { name: "Delete draft" })
      ).toBeDefined();
    }
  );

  it.each([["popover"], ["inline"]] as const)(
    "Cancel leaves everything untouched (%s)",
    (presentation) => {
      const onDelete = vi.fn(async (): Promise<DeleteDraftOutcome> => ok());
      renderAction(presentation, onDelete);
      fireEvent.click(screen.getByLabelText("More actions for Listing 100"));
      fireEvent.click(
        screen.getByRole("menuitem", { name: "Delete draft" })
      );
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByText("Delete this draft?")).toBeNull();
      expect(onDelete).not.toHaveBeenCalled();
    }
  );

  it.each([["popover"], ["inline"]] as const)(
    "a same-tick double click fires once (%s)",
    async (presentation) => {
      let resolveDelete!: (v: DeleteDraftOutcome) => void;
      const gate = new Promise<DeleteDraftOutcome>((resolve) => {
        resolveDelete = resolve;
      });
      const onDelete = vi.fn(() => gate);
      renderAction(presentation, onDelete);
      fireEvent.click(screen.getByLabelText("More actions for Listing 100"));
      fireEvent.click(
        screen.getByRole("menuitem", { name: "Delete draft" })
      );
      const button = screen.getByRole("button", { name: "Delete draft" });
      fireEvent.click(button);
      fireEvent.click(button);
      expect(onDelete).toHaveBeenCalledTimes(1);
      resolveDelete(ok());
      await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
    }
  );

  it("ignores a busy outcome without an error", async () => {
    const onDelete = vi.fn(
      async (): Promise<DeleteDraftOutcome> => ({ type: "busy" })
    );
    renderAction("inline", onDelete);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete draft" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete draft" }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Delete this draft?")).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
