"use client";

import React from "react";
import { inr, type Property } from "@/data/properties";

export default function PriceBreakdown({ p }: { p: Property }) {
  const rows: [string, string][] = [
    ["Monthly rent", inr(p.rent)],
    ["Maintenance", inr(p.maintenance)],
    ["Estimated utilities", inr(p.utilities)],
  ];
  const total = p.rent + p.maintenance + p.utilities;
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <h3 className="text-[15px] font-bold text-ink">Price breakdown</h3>
      <div className="mt-3 space-y-2.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between text-[14px]">
            <span className="text-muted">{k}</span>
            <span className="font-medium text-ink">{v}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between rounded-xl bg-brand-50 px-3 py-2.5">
        <span className="text-[14px] font-semibold text-brand-800">Estimated monthly cost</span>
        <span className="text-[17px] font-bold text-brand-800">{inr(total)}</span>
      </div>
      <div className="mt-2.5 flex items-center justify-between text-[14px]">
        <span className="text-muted">Refundable deposit (one-time)</span>
        <span className="font-semibold text-ink">{inr(p.deposit)}</span>
      </div>
    </div>
  );
}
