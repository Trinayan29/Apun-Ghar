// @vitest-environment jsdom
/**
 * Custom-area fallback in the Where chapter: when the catalog has no
 * match, the owner can keep their typed area name instead of being
 * blocked. Canonical selection keeps working and clears custom text.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WhereChapter } from "./chapters";
import { listLocations } from "@/lib/api";
import type { PlaceDraft } from "@/lib/listing-draft";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    listLocations: vi.fn(),
  };
});

afterEach(() => cleanup());

const mockedSearch = vi.mocked(listLocations);

function place(overrides: Partial<PlaceDraft> = {}): PlaceDraft {
  return {
    buildingType: "PG",
    buildingOther: "",
    placeName: "Green View House",
    address: "12 Test Road",
    locality: "",
    area: null,
    areaCustomName: "",
    city: "Guwahati",
    pincode: "",
    college: null,
    workplace: null,
    gateTime: "",
    ...overrides,
  };
}

describe("WhereChapter custom area fallback", () => {
  it("offers the typed query as a custom area when nothing matches", async () => {
    mockedSearch.mockResolvedValue([]);
    const onPlace = vi.fn();
    render(<WhereChapter place={place()} onPlace={onPlace} error={null} />);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("e.g. Beltola"), "Jyotikuchi");

    const useButton = await screen.findByRole("button", {
      name: "Use “Jyotikuchi”",
    });
    await user.click(useButton);
    expect(onPlace).toHaveBeenCalledWith({
      area: null,
      areaCustomName: "Jyotikuchi",
    });
  });

  it("shows the custom area as selected with a working Clear", async () => {
    const onPlace = vi.fn();
    render(
      <WhereChapter
        place={place({ areaCustomName: "Jyotikuchi" })}
        onPlace={onPlace}
        error={null}
      />
    );
    expect(screen.getByText("Jyotikuchi")).toBeDefined();
    expect(screen.getByText(/saved with your property as entered/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onPlace).toHaveBeenCalledWith({ areaCustomName: "" });
  });

  it("canonical selection still works and clears custom text", async () => {
    mockedSearch.mockResolvedValue([
      { id: 7, type: "area", name: "Beltola", city: "Guwahati" },
    ]);
    const onPlace = vi.fn();
    const view = render(
      <WhereChapter
        place={place({ areaCustomName: "Jyotikuchi" })}
        onPlace={onPlace}
        error={null}
      />
    );
    // Clear the custom value first to reveal the search field (controlled
    // component: reflect the patch the way the real page would).
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onPlace).toHaveBeenCalledWith({ areaCustomName: "" });
    view.rerender(
      <WhereChapter place={place()} onPlace={onPlace} error={null} />
    );
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("e.g. Beltola"), "Bel");
    await user.click(await screen.findByText("Beltola"));
    expect(onPlace).toHaveBeenCalledWith({
      area: { id: 7, type: "area", name: "Beltola", city: "Guwahati" },
      areaCustomName: "",
    });
  });

  it("does not offer the fallback for college/workplace fields", async () => {
    mockedSearch.mockResolvedValue([]);
    render(<WhereChapter place={place()} onPlace={vi.fn()} error={null} />);
    const user = userEvent.setup();
    // College search with no matches: no "Use ..." button anywhere.
    await user.type(screen.getByPlaceholderText("e.g. Cotton University"), "Xyz");
    await screen.findByText("No matches found. You can skip — this stays optional.");
    const labels = screen
      .queryAllByRole("button")
      .map((b) => b.textContent ?? "");
    expect(labels.some((t) => t.startsWith("Use "))).toBe(false);
  });
});
