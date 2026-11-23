"use client";

import { useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { formatEuros, localeTags, type Locale } from "@/server/locale";
import { trendRanges, type Trend, type TrendPoint, type TrendRange } from "@/server/trend";
import { Area } from "@/components/charts/area";
import { AreaChart } from "@/components/charts/area-chart";
import { Grid } from "@/components/charts/grid";
import { ChartTooltip } from "@/components/charts/tooltip";
import { XAxis } from "@/components/charts/x-axis";
import { Icon } from "./icon";

const copy = {
  en: {
    hide: "Hide amounts", absolute: "Absolute", percent: "Percent", period: "Period", asOf: "As of",
    ranges: { "1M": "1M", "3M": "3M", YTD: "YTD", "1Y": "1Y", MAX: "Max" },
    rangeNames: { "1M": "last month", "3M": "last 3 months", YTD: "year to date", "1Y": "last year", MAX: "all time" },
    hiddenChart: "Chart of the selected period; amounts are hidden",
  },
  it: {
    hide: "Nascondi importi", absolute: "Assoluto", percent: "Percentuale", period: "Periodo", asOf: "Al",
    ranges: { "1M": "1M", "3M": "3M", YTD: "YTD", "1Y": "1A", MAX: "Max" },
    rangeNames: { "1M": "ultimo mese", "3M": "ultimi 3 mesi", YTD: "da inizio anno", "1Y": "ultimo anno", MAX: "dall'inizio" },
    hiddenChart: "Grafico del periodo selezionato; importi nascosti",
  },
};

// One key for both pages: hiding amounts on net worth also hides them on investments.
const HIDE_KEY = "getstead.hideAmounts";
const MASK = "••••••";
// Fallback for this visit when storage is blocked (private mode, disabled site data).
let hiddenInMemory = false;
const hideListeners = new Set<() => void>();
function readHidden() {
  try { const stored = localStorage.getItem(HIDE_KEY); return stored === null ? hiddenInMemory : stored === "1"; } catch { return hiddenInMemory; }
}
function writeHidden(hidden: boolean) {
  hiddenInMemory = hidden;
  try { localStorage.setItem(HIDE_KEY, hidden ? "1" : "0"); } catch { /* memory fallback above */ }
  hideListeners.forEach((listener) => listener());
}
function subscribeHidden(listener: () => void) {
  hideListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => { hideListeners.delete(listener); window.removeEventListener("storage", listener); };
}

/** Performance since the first point, measured against each point's base; null when there is nothing to measure against. */
const percentAt = (point: TrendPoint, first: TrendPoint) =>
  point.baseCents > 0 ? (point.gainCents - first.gainCents) / point.baseCents : null;

/** Value, performance and a period chart: shared by net worth and investments. */
export function TrendCard({ locale, title, note, today, trend, action }: {
  locale: Locale; title: string; note: string; today: string; trend: Trend; action?: ReactNode;
}) {
  const labels = copy[locale];
  const ids = useId();
  const [range, setRange] = useState<TrendRange>("1Y");
  const [percent, setPercent] = useState(false);
  // The server renders amounts visible; the client then applies the stored choice.
  const hidden = useSyncExternalStore(subscribeHidden, readHidden, () => false);
  const toggleHidden = () => writeHidden(!hidden);

  const points = trend[range];
  const first = points[0], last = points.at(-1)!;
  const changeCents = last.gainCents - first.gainCents;
  const share = percentAt(last, first);
  const tone = changeCents > 0 ? "positive" : changeCents < 0 ? "negative" : "";
  const percentText = (value: number | null) => value === null ? "—" : new Intl.NumberFormat(localeTags[locale], {
    style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero",
  }).format(value);
  const money = (cents: number, showPlus = false) => hidden ? MASK : formatEuros(cents, locale, { showPlus });
  const value = money(last.valueCents);
  const long = range === "1Y" || range === "MAX";
  const day = (date: string) => new Intl.DateTimeFormat(localeTags[locale], long
    ? { month: "short", year: "numeric", timeZone: "UTC" } : { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
  const series = points.map((point) => ({
    date: new Date(`${point.date}T00:00:00Z`), label: day(point.date),
    value: percent ? percentAt(point, first) ?? 0 : point.valueCents,
  }));
  // Fit the plot to the series instead of anchoring it at zero, so a steady trend still shows its shape.
  const low = Math.min(...series.map(({ value }) => value)), high = Math.max(...series.map(({ value }) => value));
  const pad = (high - low) * 0.15 || Math.abs(high) * 0.01 || 1;
  const summary = hidden ? labels.hiddenChart : `${title}, ${labels.rangeNames[range]}: ${day(first.date)} ${formatEuros(first.valueCents, locale)}, ${day(last.date)} ${formatEuros(last.valueCents, locale)}`;

  return (
    <section className="card trend-card" data-tone={tone || undefined} aria-labelledby={`${ids}title`}>
      <div className="trend-toolbar">
        <button type="button" className="button button-quiet" aria-pressed={hidden} onClick={toggleHidden}>
          <Icon name={hidden ? "eyeOff" : "eye"} size={18} />{labels.hide}
        </button>
        <button type="button" className="button button-quiet" aria-pressed={percent} onClick={() => setPercent(!percent)}>
          <Icon name="recurring" size={18} />{percent ? labels.percent : labels.absolute}
        </button>
        {action && <span className="trend-action">{action}</span>}
      </div>
      <div className="trend-head">
        <div>
          <h2 id={`${ids}title`} className="hero-label">{title}</h2>
          <p className="trend-value amount" aria-live="polite">
            {percent ? percentText(share) : hidden ? value : <>{value.slice(0, -3)}<small>{value.slice(-3)}</small></>}
          </p>
          <p className="trend-change amount">
            {changeCents !== 0 && <span className="trend-arrow"><Icon name="arrowUp" size={14} /></span>}
            {percent ? money(changeCents, true) : <>{percentText(share)} ({money(changeCents, true)})</>}
            <span className="trend-period"> · {labels.rangeNames[range]}</span>
          </p>
        </div>
        <div className="trend-ranges" role="group" aria-label={labels.period}>
          {trendRanges.map((key) => (
            <button key={key} type="button" aria-pressed={range === key} onClick={() => setRange(key)}>{labels.ranges[key]}</button>
          ))}
        </div>
      </div>
      <div className="trend-chart" role="img" aria-label={summary}>
        <AreaChart data={series} aspectRatio="3 / 1" margin={{ top: 12, right: 24, bottom: 28, left: 24 }} revealSignature={range}
          yDomainOverrides={{ left: [low - pad, high + pad] }}>
          <Grid horizontal numTicksRows={3} />
          <Area dataKey="value" fill="var(--chart-line-primary)" fillOpacity={0.22} fadeBottom={100} />
          <XAxis numTicks={3} labels={series.map(({ label }) => label)} />
          <ChartTooltip dateLabels={series.map(({ label }) => label)} rows={(point) => [
            { color: "var(--chart-line-primary)", label: title, value: percent ? percentText(Number(point.value)) : money(Number(point.value)) },
          ]} />
        </AreaChart>
      </div>
      <p className="hint trend-note">{note} {labels.asOf} <time dateTime={today}>{new Intl.DateTimeFormat(localeTags[locale], { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${today}T00:00:00Z`))}</time></p>
    </section>
  );
}
