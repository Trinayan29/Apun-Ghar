// @vitest-environment jsdom
/**
 * Regression tests for UID-scoped property loading (Choose Property).
 * A previous implementation loaded once per mount and never reset on
 * account switch, so Owner B could briefly see Owner A's properties.
 */
import { describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach } from "vitest";
import { usePropertyChooser } from "./use-property-chooser";
import { listOwnerProperties, listPropertyUnits } from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    listOwnerProperties: vi.fn(),
    listPropertyUnits: vi.fn(async () => []),
  };
});

afterEach(() => cleanup());

const mockedList = vi.mocked(listOwnerProperties);

function prop(id: number, name: string | null) {
  return {
    id,
    property_type: "PG",
    name,
    address_line: `${id} Test Road`,
    locality: null,
    city: "Guwahati",
    pincode: null,
    area_location_id: null,
    area_location: null,
  };
}

function Harness({ uid }: { uid: string }) {
  const data = usePropertyChooser(uid);
  return (
    <div>
      <button type="button" onClick={() => void data.loadProperties()}>
        load
      </button>
      <div data-testid="props">
        {data.properties ? data.properties.map((p) => p.name ?? "?").join(",") : "none"}
      </div>
      <div data-testid="error">{data.propertiesError ?? "ok"}</div>
    </div>
  );
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("usePropertyChooser UID isolation", () => {
  it("loads one user's properties", async () => {
    mockedList.mockResolvedValueOnce([prop(1, "A House")]);
    render(<Harness uid="user-a" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "load" }));
    });
    expect(screen.getByTestId("props").textContent).toBe("A House");
  });

  it("clears A's list on switch to B and loads B without refetch block", async () => {
    mockedList.mockResolvedValueOnce([prop(1, "A House")]);
    const view = render(<Harness uid="user-a" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "load" }));
    });
    expect(screen.getByTestId("props").textContent).toBe("A House");
    expect(mockedList).toHaveBeenCalledTimes(1);

    mockedList.mockResolvedValueOnce([prop(2, "B House")]);
    view.rerender(<Harness uid="user-b" />);
    // A's properties must never render for B — not even before B loads.
    expect(screen.getByTestId("props").textContent).toBe("none");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "load" }));
    });
    expect(screen.getByTestId("props").textContent).toBe("B House");
    // The one-shot guard did not swallow B's fetch.
    expect(mockedList).toHaveBeenCalledTimes(2);
  });

  it("drops a stale in-flight result after an account switch", async () => {
    const a = deferred<{ id: number }[]>();
    mockedList.mockReturnValueOnce(a.promise as never);
    const view = render(<Harness uid="user-a" />);
    fireEvent.click(screen.getByRole("button", { name: "load" }));

    mockedList.mockResolvedValueOnce([prop(2, "B House")]);
    view.rerender(<Harness uid="user-b" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "load" }));
    });
    // A's late response must not overwrite B's data.
    await act(async () => {
      a.resolve([prop(1, "A House")] as never);
    });
    expect(screen.getByTestId("props").textContent).toBe("B House");
  });

  it("surfaces load failure and allows retry", async () => {
    mockedList.mockRejectedValueOnce(new Error("down"));
    render(<Harness uid="user-a" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "load" }));
    });
    // Non-API errors fall back to the friendly message, never internals.
    expect(screen.getByTestId("error").textContent).toBe(
      "Couldn't load your properties."
    );
    expect(screen.getByTestId("props").textContent).toBe("none");
    mockedList.mockResolvedValueOnce([prop(1, "A House")]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "load" }));
    });
    expect(screen.getByTestId("props").textContent).toBe("A House");
    expect(screen.getByTestId("error").textContent).toBe("ok");
  });
});
