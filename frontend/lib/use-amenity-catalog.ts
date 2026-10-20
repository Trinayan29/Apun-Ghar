"use client";

import { useEffect, useState } from "react";
import { getAmenityCatalog } from "./api";
import type { AmenityCatalogEntry } from "./listing-submit";

/**
 * Load the active amenity catalog once per mount (GET /api/v1/amenities).
 *
 * Returns `undefined` until it resolves, and stays `undefined` on failure.
 * Callers must treat `undefined` as "not available yet" and let the
 * submit/save flows surface a clear error when a draft has amenity
 * selections that cannot be resolved — never as "no amenities exist".
 */
export function useAmenityCatalog(): AmenityCatalogEntry[] | undefined {
  const [catalog, setCatalog] = useState<AmenityCatalogEntry[] | undefined>(
    undefined
  );

  useEffect(() => {
    let cancelled = false;
    getAmenityCatalog()
      .then((rows) => {
        if (!cancelled) setCatalog(rows);
      })
      .catch(() => {
        // Leave undefined: selection-bearing sends surface the failure.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return catalog;
}
