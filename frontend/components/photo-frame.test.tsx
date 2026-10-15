// @vitest-environment jsdom
/**
 * Regression test: a PhotoFrame that failed to load must retry when its
 * source changes (gallery thumbnail switch), not stay on the fallback.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import PhotoFrame from "./photo-frame";

afterEach(() => {
  cleanup();
});

describe("PhotoFrame source change", () => {
  it("retries a new source after the previous image failed", () => {
    const { rerender } = render(
      <PhotoFrame src="https://example.test/broken.jpg" alt="Place photo" />
    );
    fireEvent.error(screen.getByAltText("Place photo"));
    expect(screen.getByRole("img", { name: "No photo available" })).toBeDefined();

    rerender(
      <PhotoFrame src="https://example.test/working.jpg" alt="Place photo" />
    );
    const retry = screen.getByAltText("Place photo");
    expect(retry.tagName).toBe("IMG");
    expect(retry.getAttribute("src")).toBe("https://example.test/working.jpg");
  });

  it("still shows the fallback when the new source also fails", () => {
    const { rerender } = render(
      <PhotoFrame src="https://example.test/broken-1.jpg" alt="Place photo" />
    );
    fireEvent.error(screen.getByAltText("Place photo"));
    rerender(
      <PhotoFrame src="https://example.test/broken-2.jpg" alt="Place photo" />
    );
    fireEvent.error(screen.getByAltText("Place photo"));
    expect(screen.getByRole("img", { name: "No photo available" })).toBeDefined();
  });
});
