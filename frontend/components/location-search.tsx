"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { listLocations, type LocationItem, type LocationKind } from "@/lib/api";
import { Field, TextField } from "@/components/auth-ui";

type SearchStatus = "idle" | "searching" | "done" | "error";

/**
 * Shared location search field (Slice 3B-3C).
 *
 * Used by college/workplace onboarding steps and profile editing.
 * - Debounced search against GET /api/v1/locations (read-only).
 * - Monotonic request IDs: an older response can never overwrite newer
 *   results, no matter what order responses arrive in.
 * - Loading / successful-empty / request-error states are kept separate.
 *   Errors surface a message + Retry and never masquerade as "no matches".
 * - Query text and the already-selected value are preserved across
 *   failures; Continue/Skip stay usable because selection is optional.
 */
export function LocationSearchField({
  kind,
  label,
  placeholder,
  value,
  disabled,
  onSelect,
  onClear,
  onUseCustomArea,
}: {
  kind: LocationKind;
  label: string;
  placeholder: string;
  value: LocationItem | null;
  disabled?: boolean;
  onSelect: (loc: LocationItem) => void;
  onClear: () => void;
  /** Area-only opt-in: offer the typed query as a custom area name when
   *  the catalog has no match. Never used for college/workplace. */
  onUseCustomArea?: (name: string) => void;
}) {
  const inputId = `${kind}-location-search`;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LocationItem[]>([]);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const requestId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(
    (q: string) => {
      const id = ++requestId.current;
      setStatus("searching");
      listLocations(kind, q).then(
        (rows) => {
          if (requestId.current !== id) return; // stale response
          setResults(rows);
          setStatus("done");
        },
        () => {
          if (requestId.current !== id) return; // stale response
          setStatus("error");
        }
      );
    },
    [kind]
  );

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim();
    if (!q) {
      // A new keystroke invalidates in-flight requests without surfacing
      // an error: results are simply not applicable anymore.
      requestId.current++;
      setResults([]);
      setStatus("idle");
      return;
    }
    setStatus("searching");
    timer.current = setTimeout(() => runSearch(q), 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, runSearch]);

  const showEmpty =
    status === "done" && query.trim() !== "" && results.length === 0;

  return (
    <div>
      <Field id={inputId} label={label}>
        {value ? (
          <div className="flex min-h-[52px] items-center justify-between gap-2 rounded-xl border border-line bg-white px-4">
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">
              {value.name}
            </span>
            <button
              type="button"
              disabled={disabled}
              onClick={onClear}
              className="flex min-h-[44px] shrink-0 items-center px-1 text-[13px] font-bold text-brand-700 underline disabled:opacity-60"
            >
              Clear
            </button>
          </div>
        ) : (
          <TextField
            id={inputId}
            type="text"
            autoComplete="off"
            placeholder={placeholder}
            value={query}
            disabled={disabled}
            onChange={setQuery}
          />
        )}
      </Field>

      {status === "searching" && (
        <p className="mt-2 text-[13.5px] text-muted" role="status">
          Searching…
        </p>
      )}

      {showEmpty && !onUseCustomArea && (
        <p className="mt-2 text-[13.5px] text-muted">
          No matches found. You can skip — this stays optional.
        </p>
      )}

      {showEmpty && onUseCustomArea && (
        <div className="mt-2 rounded-xl border border-line bg-white px-3.5 py-3">
          <p className="text-[13.5px] text-muted">No matches found.</p>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              const name = query.trim();
              if (name) onUseCustomArea(name);
            }}
            className="mt-2 flex min-h-[44px] w-full items-center justify-center rounded-xl bg-brand-600 px-4 text-[14px] font-bold text-white transition active:scale-[0.98] disabled:opacity-60"
          >
            Use “{query.trim()}”
          </button>
        </div>
      )}

      {status === "error" && (
        <div className="mt-3 rounded-xl bg-red-50 px-3.5 py-3">
          <p role="alert" className="text-[13.5px] font-medium text-red-700">
            Search isn&apos;t working right now. Your selection (if any) is
            kept — try again or continue without it.
          </p>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              const q = query.trim();
              if (q) runSearch(q);
            }}
            className="mt-2 h-10 rounded-xl border border-line bg-white px-4 text-[14px] font-bold disabled:opacity-60"
          >
            Retry search
          </button>
        </div>
      )}

      {results.length > 0 && (
        <ul className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
          {results.map((loc) => (
            <li key={loc.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  onSelect(loc);
                  requestId.current++;
                  setQuery("");
                  setResults([]);
                  setStatus("idle");
                }}
                className="flex w-full items-center justify-between px-4 py-3 text-left transition active:bg-brand-50"
              >
                <span className="text-[14.5px] font-semibold">
                  {loc.name}
                  <span className="block text-[12.5px] font-normal text-muted">
                    {loc.city}
                  </span>
                </span>
                <span aria-hidden className="text-brand-700">
                  →
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
