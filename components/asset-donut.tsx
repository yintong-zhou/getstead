"use client";

import { PrivateAmount } from "./amount-visibility";
import { euros } from "@/components/euros";
import { PieCenter } from "@/components/charts/pie-center";
import { PieChart } from "@/components/charts/pie-chart";
import { PieSlice } from "@/components/charts/pie-slice";
import type { Locale } from "@/server/locale";

/** Gross assets by group; at rest the center shows net worth, on hover the slice. Slices must be positive. */
export function AssetDonut({ slices, netWorthCents, centerLabel, summary, locale }: {
  slices: { label: string; value: number; color: string }[]; netWorthCents: number; centerLabel: string; summary: string; locale: Locale;
}) {
  return (
    <div className="allocation-donut" role="img" aria-label={summary}>
      <PieChart data={slices} size={176} innerRadius={60} padAngle={0.03} cornerRadius={4} hoverOffset={6}>
        {slices.map((slice, index) => <PieSlice key={slice.label} index={index} />)}
        <PieCenter defaultLabel={centerLabel}>
          {({ value, label, isHovered }) => (
            <span className="allocation-center">
              <strong className="amount"><PrivateAmount>{euros(isHovered ? value : netWorthCents, locale, { wholeEuros: true })}</PrivateAmount></strong>
              <small>{label}</small>
            </span>
          )}
        </PieCenter>
      </PieChart>
    </div>
  );
}
