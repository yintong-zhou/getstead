"use client";

import { Bar } from "@/components/charts/bar";
import { BarChart } from "@/components/charts/bar-chart";
import { BarXAxis } from "@/components/charts/bar-x-axis";
import { Grid } from "@/components/charts/grid";
import { ChartTooltip } from "@/components/charts/tooltip";
import { formatEuros, type Locale } from "@/server/locale";

export type CashFlowPoint = { label: string; incomeCents: number; expenseCents: number };

/** Income against expenses per month. Amounts stay in integer cents; they are formatted only for display. */
export function CashFlowChart({ points, locale, labels, summary }: {
  points: CashFlowPoint[]; locale: Locale; labels: { income: string; expenses: string }; summary: string;
}) {
  // A month where refunds exceed spending has a negative net expense; the bar shows its size and the note below the chart names it.
  const data = points.map(({ label, incomeCents, expenseCents }) => ({
    label, income: incomeCents, expense: Math.abs(expenseCents), expenseCents,
  }));
  return (
    <div role="img" aria-label={summary}>
      <BarChart data={data} xDataKey="label" aspectRatio="5 / 2" margin={{ top: 12, right: 8, bottom: 28, left: 8 }} barGap={0.35}>
        <Grid horizontal numTicksRows={4} />
        <Bar dataKey="income" fill="var(--positive)" lineCap={4} />
        <Bar dataKey="expense" fill="var(--negative)" lineCap={4} />
        <BarXAxis />
        <ChartTooltip rows={(point) => [
          { color: "var(--positive)", label: labels.income, value: formatEuros(Number(point.income), locale) },
          { color: "var(--negative)", label: labels.expenses, value: formatEuros(Number(point.expenseCents), locale) },
        ]} />
      </BarChart>
    </div>
  );
}
