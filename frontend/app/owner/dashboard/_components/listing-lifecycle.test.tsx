// @vitest-environment jsdom
/**
 * Component tests for the Phase F Pause / Resume action.
 * Injected fake API helpers keep these hermetic (no network, no Firebase).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { ListingLifecycleAction } from "./listing-lifecycle";

// RTL auto-cleanup hooks into globals-based afterEach, which this repo
// doesn't enable — unmount explicitly so renders don't accumulate.
afterEach(() => cleanup());

function renderAction(
  over: {
    lifecycle?: string;
    pauseListing?: (id: number) => Promise<unknown>;
    publishListing?: (id: number) => Promise<unknown>;
  } = {}
) {
  const onChanged = vi.fn();
  const pauseListing = over.pauseListing ?? (async () => ({}));
  const publishListing = over.publishListing ?? (async () => ({}));
  render(
    <ListingLifecycleAction
      listingId={30}
      lifecycle={over.lifecycle ?? "PUBLISHED"}
      onChanged={onChanged}
      pauseListing={pauseListing}
      publishListing={publishListing}
    />
  );
  return { onChanged };
}

describe("lifecycle-gated rendering", () => {
  it("renders Pause for published listings", () => {
    renderAction({ lifecycle: "PUBLISHED" });
    expect(screen.getByRole("button", { name: "Pause" })).toBeDefined();
  });

  it("renders Resume for paused listings", () => {
    renderAction({ lifecycle: "PAUSED" });
    expect(screen.getByRole("button", { name: "Resume" })).toBeDefined();
  });

  it("renders nothing for draft listings", () => {
    const { container } = render(
      <ListingLifecycleAction
        listingId={30}
        lifecycle="DRAFT"
        onChanged={() => {}}
      />
    );
    expect(container.textContent).toBe("");
  });
});

describe("pause confirmation", () => {
  it("opens and cancels without any API call", async () => {
    const pauseListing = vi.fn(async () => ({}));
    renderAction({ pauseListing });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    });
    expect(
      screen.getByText(
        "Renters won't see this listing while it's paused. You can resume it later."
      )
    ).toBeDefined();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Keep live" }));
    });
    expect(pauseListing).not.toHaveBeenCalled();
    expect(screen.queryByText(/Renters won't see/)).toBeNull();
  });

  it("confirm calls pause with the listing id then reloads", async () => {
    const pauseListing = vi.fn(async () => ({}));
    const { onChanged } = renderAction({ pauseListing });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirm pause" }));
    });
    expect(pauseListing).toHaveBeenCalledTimes(1);
    expect(pauseListing).toHaveBeenCalledWith(30);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("pause failure keeps published state and exposes the error", async () => {
    const pauseListing = vi.fn(async () => {
      throw new Error("only PUBLISHED listings can be paused");
    });
    const { onChanged } = renderAction({ pauseListing });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirm pause" }));
    });
    expect(onChanged).not.toHaveBeenCalled();
    expect(
      screen.getByText("only PUBLISHED listings can be paused")
    ).toBeDefined();
    // Try again re-attempts with the same id.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });
    expect(pauseListing).toHaveBeenCalledTimes(2);
  });

  it("two same-tick confirms send one request (synchronous guard)", async () => {
    let resolve!: (v: unknown) => void;
    const pauseListing = vi.fn(
      () => new Promise<unknown>((r) => (resolve = r))
    );
    renderAction({ pauseListing });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    });
    const confirm = screen.getByRole("button", { name: "Confirm pause" });
    // Both dispatches run before React flushes: the disabled attribute
    // cannot protect the second click, only the synchronous ref guard can.
    act(() => {
      fireEvent.click(confirm);
      fireEvent.click(confirm);
    });
    expect(pauseListing).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve({});
    });
    expect(pauseListing).toHaveBeenCalledTimes(1);
  });

  it("double-clicking confirm sends one request and disables while in flight", async () => {
    let resolve!: (v: unknown) => void;
    const pauseListing = vi.fn(
      () => new Promise<unknown>((r) => (resolve = r))
    );
    renderAction({ pauseListing });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    });
    const confirm = screen.getByRole("button", { name: "Confirm pause" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(screen.getByRole("button", { name: "Pausing…" })).toBeDefined();
    await act(async () => {
      resolve({});
    });
    expect(pauseListing).toHaveBeenCalledTimes(1);
  });
});

describe("resume", () => {
  it("calls the publish endpoint and reloads on success", async () => {
    const publishListing = vi.fn(async () => ({}));
    const { onChanged } = renderAction({ lifecycle: "PAUSED", publishListing });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    });
    expect(publishListing).toHaveBeenCalledTimes(1);
    expect(publishListing).toHaveBeenCalledWith(30);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("backend guard failure keeps paused state and shows the reason", async () => {
    const publishListing = vi.fn(async () => {
      throw new Error("OCCUPIED listings cannot be published");
    });
    const { onChanged } = renderAction({ lifecycle: "PAUSED", publishListing });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    });
    expect(onChanged).not.toHaveBeenCalled();
    expect(
      screen.getByText("OCCUPIED listings cannot be published")
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Try again" })
    ).toBeDefined();
  });
});
