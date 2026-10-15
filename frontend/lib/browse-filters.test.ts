/**
 * Component-level coverage for the browse filter form.
 *
 * Lives in lib/ (matched by vitest.config.ts) and renders the real
 * BrowseFilters component to static markup with React.createElement, so
 * no JSX transform is needed in this .ts test file. Asserts the
 * validation-error path: an invalid budget must render visibly inside
 * the form, independent of any listing-load status.
 */
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import BrowseFilters from "../app/listings/_components/browse-filters";

function renderForm(filterError: string | null): string {
  return renderToStaticMarkup(
    createElement(BrowseFilters, {
      draftBudget: "abc",
      onBudgetChange: vi.fn(),
      draftPropertyType: "",
      onPropertyTypeChange: vi.fn(),
      draftArea: null,
      onAreaSelect: vi.fn(),
      onAreaClear: vi.fn(),
      disabled: false,
      filterError,
      onApply: vi.fn(),
      onClear: vi.fn(),
    })
  );
}

describe("BrowseFilters validation error", () => {
  it("renders the budget error inside the filter form", () => {
    const html = renderForm("Enter a whole-rupee budget greater than zero.");
    expect(html).toContain('role="alert"');
    expect(html).toContain(
      "Enter a whole-rupee budget greater than zero."
    );
    // The form stays usable: budget input and actions still render.
    expect(html).toContain('id="browse-budget"');
    expect(html).toContain("Apply filters");
  });

  it("renders no error block when the budget is valid", () => {
    const html = renderForm(null);
    expect(html).not.toContain('role="alert"');
    expect(html).toContain('id="browse-budget"');
  });

  it("renders the supported property-type options", () => {
    const html = renderForm(null);
    for (const label of ["All property types", "PG", "Hostel", "Apartment"]) {
      expect(html).toContain(label);
    }
  });
});
