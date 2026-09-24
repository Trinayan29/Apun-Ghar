import type { ReactNode } from "react";

/**
 * Owner Studio shell layout (Phase B — structure only).
 * Single column up to lg; 7/12 + 5/12 two-column on desktop.
 * Section bodies arrive in later phases; this file only owns proportions.
 */
export function StudioShell({
  main,
  rail,
}: {
  main: ReactNode;
  rail: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-5 py-5 lg:px-8">
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="min-w-0 space-y-6 lg:col-span-7">{main}</div>
        <div className="min-w-0 space-y-6 lg:col-span-5">{rail}</div>
      </div>
    </div>
  );
}
