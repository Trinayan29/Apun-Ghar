"use client";

import { useCallback, useRef, useState } from "react";
import {
  ApiError,
  listOwnerProperties,
  listPropertyUnits,
  type OwnerPropertyItem,
} from "@/lib/api";

/**
 * Owner property list for the Choose Property chapter, explicitly keyed
 * by Firebase UID. Switching accounts must never render the previous
 * user's property names/addresses — not even for a frame — so loaded
 * data carries its owner UID and is only exposed on match. Unit counts
 * are best-effort (a count failure hides that line, never selection).
 */
export function usePropertyChooser(uid: string | undefined) {
  const [snapshot, setSnapshot] = useState<{
    uid: string;
    properties: OwnerPropertyItem[];
    unitsCount: Record<number, number>;
  } | null>(null);
  const [propertiesError, setPropertiesError] = useState<string | null>(null);
  const loadedUidRef = useRef<string | null>(null);

  const loadProperties = useCallback(async () => {
    if (!uid || loadedUidRef.current === uid) return;
    loadedUidRef.current = uid;
    setPropertiesError(null);
    try {
      const rows = await listOwnerProperties();
      const counts = await Promise.all(
        rows.map(async (row) => {
          try {
            const units = await listPropertyUnits(row.id);
            return [row.id, units.length] as const;
          } catch {
            return null;
          }
        })
      );
      // A newer load (account switch mid-flight) wins; stale results die here.
      if (loadedUidRef.current !== uid) return;
      const unitsCount: Record<number, number> = {};
      for (const entry of counts) {
        if (entry) unitsCount[entry[0]] = entry[1];
      }
      setSnapshot({ uid, properties: rows, unitsCount });
    } catch (err) {
      if (loadedUidRef.current !== uid) return;
      loadedUidRef.current = null;
      setPropertiesError(
        err instanceof ApiError ? err.message : "Couldn't load your properties."
      );
    }
  }, [uid]);

  const visible = snapshot !== null && snapshot.uid === uid ? snapshot : null;
  return {
    properties: visible?.properties ?? null,
    unitsCount: visible?.unitsCount ?? {},
    propertiesError,
    loadProperties,
  };
}
