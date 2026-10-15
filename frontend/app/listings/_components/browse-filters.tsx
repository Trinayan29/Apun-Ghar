import { Field, FormError, TextField } from "@/components/auth-ui";
import { LocationSearchField } from "@/components/location-search";
import type { LocationItem } from "@/lib/api";
import {
  PUBLIC_PROPERTY_TYPES,
  type PublicPropertyType,
} from "@/lib/public-listings";
import { displayPropertyType } from "@/lib/public-listing-view";

const PROPERTY_TYPE_OPTIONS: { value: "" | PublicPropertyType; label: string }[] = [
  { value: "", label: "All property types" },
  ...PUBLIC_PROPERTY_TYPES.map((value) => ({
    value,
    label: displayPropertyType(value),
  })),
];

/**
 * Presentational browse filter form. Validation feedback (filterError)
 * renders inside the form section itself, independent of the listing
 * load status, so an invalid budget can never look silently ignored.
 */
export default function BrowseFilters({
  draftBudget,
  onBudgetChange,
  draftPropertyType,
  onPropertyTypeChange,
  draftArea,
  onAreaSelect,
  onAreaClear,
  disabled,
  filterError,
  onApply,
  onClear,
}: {
  draftBudget: string;
  onBudgetChange: (value: string) => void;
  draftPropertyType: "" | PublicPropertyType;
  onPropertyTypeChange: (value: "" | PublicPropertyType) => void;
  draftArea: LocationItem | null;
  onAreaSelect: (location: LocationItem) => void;
  onAreaClear: () => void;
  disabled: boolean;
  filterError: string | null;
  onApply: () => void;
  onClear: () => void;
}) {
  return (
    <section
      aria-label="Listing filters"
      className="mt-5 rounded-2xl border border-line bg-white p-4"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onApply();
        }}
        className="grid gap-3 sm:grid-cols-3"
      >
        <Field id="browse-budget" label="Max monthly budget (₹, optional)">
          <TextField
            id="browse-budget"
            type="text"
            autoComplete="off"
            placeholder="e.g. 8000"
            value={draftBudget}
            disabled={disabled}
            onChange={onBudgetChange}
          />
        </Field>
        <div>
          <label
            htmlFor="browse-property-type"
            className="mb-1.5 block text-[13px] font-semibold"
          >
            Property type
          </label>
          <select
            id="browse-property-type"
            value={draftPropertyType}
            disabled={disabled}
            onChange={(event) =>
              onPropertyTypeChange(
                event.target.value as "" | PublicPropertyType
              )
            }
            className="h-12 w-full rounded-xl border border-line bg-white px-4 text-[15px] disabled:opacity-60"
          >
            {PROPERTY_TYPE_OPTIONS.map((option) => (
              <option key={option.label} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <LocationSearchField
          kind="area"
          label="Area (optional)"
          placeholder="Search areas"
          value={draftArea}
          disabled={disabled}
          onSelect={onAreaSelect}
          onClear={onAreaClear}
        />
      </form>
      {filterError && (
        <div className="mt-3">
          <FormError message={filterError} />
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onApply}
          disabled={disabled}
          className="flex min-h-[48px] items-center justify-center rounded-xl bg-brand-600 px-5 text-[14.5px] font-bold text-white transition active:scale-[0.98] disabled:opacity-60"
        >
          Apply filters
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          className="flex min-h-[48px] items-center justify-center rounded-xl border border-line bg-white px-5 text-[14.5px] font-bold disabled:opacity-60"
        >
          Clear
        </button>
      </div>
    </section>
  );
}
