import type { CSSProperties } from "react";
import { formatEuros, localeTags, type Locale } from "@/server/locale";
import { BrandMark } from "../brand-mark";
import { Icon } from "../icon";
import { landingCopy } from "./copy";
import { euros, signedText } from "@/components/euros";
import { CashFlowChart } from "../cash-flow-chart";
import { rangeStart, sampleDates } from "@/server/trend";

/*
 * Product previews for the public home. Every figure here is made up (the footer says so) and kept in
 * integer cents. The markup reuses the app's own classes from app/globals.css, so a preview looks like
 * the screen it stands for.
 */

type Props = { locale: Locale };

const percent = (locale: Locale, value: number, signed = true) =>
  new Intl.NumberFormat(localeTags[locale], {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: signed ? "always" : "auto",
  }).format(value);

/** Two decimals and a lifted sign, like the overview's market table. */
const signedPercent = (locale: Locale, value: number) =>
  signedText(new Intl.NumberFormat(localeTags[locale], { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" }).format(value));

const shortDate = (locale: Locale, iso: string) =>
  new Intl.DateTimeFormat(localeTags[locale], { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

/** Six months of income and expenses, in cents. */
const trend = [
  { income: 310_000, expense: 240_000 },
  { income: 310_000, expense: 275_000 },
  { income: 315_000, expense: 210_000 },
  { income: 310_000, expense: 260_000 },
  { income: 320_000, expense: 290_000 },
  { income: 325_000, expense: 201_000 },
];

/** Synthetic balances, in cents: gross assets by group, and the debt that nets them down. */
const assets = { cash: 1_480_000, savings: 1_950_000, investments: 2_400_000, pension: 1_650_000, property: 11_200_000 };
const mortgageCents = 4_850_000;
const grossCents = Object.values(assets).reduce((sum, cents) => sum + cents, 0);
const netWorthCents = grossCents - mortgageCents;
const groupColors = { cash: "var(--chart-1)", savings: "var(--chart-5)", investments: "var(--chart-2)", pension: "var(--chart-4)", property: "var(--chart-3)" } as const;

/** A steady climb with a little noise, ending at today's net worth. Deterministic, so the page stays static. */
const MOCK_TODAY = "2026-11-25";
const daysBefore = (date: string) => Math.round((Date.parse(`${MOCK_TODAY}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);
const worthAt = (date: string) => { const days = daysBefore(date); return netWorthCents - Math.round(days * 2_150 + 42_000 * Math.sin(days / 17)); };
const worthSeries = sampleDates(rangeStart("1Y", MOCK_TODAY, null), MOCK_TODAY).map((date) => ({ date, cents: worthAt(date) }));

/** The overview's donut as plain SVG: arcs on a circle of pathLength 100, so no chart library ships to the public page. */
function Donut({ slices, centre, label, summary }: { slices: { cents: number; color: string }[]; centre: string; label: string; summary: string }) {
  const total = slices.reduce((sum, { cents }) => sum + cents, 0);
  const gap = 1.4;
  const shares = slices.map(({ cents }) => (cents / total) * 100);
  return (
    <div className="allocation-donut" role="img" aria-label={summary}>
      <div className="mock-donut">
        <svg viewBox="0 0 176 176" aria-hidden="true">
          {slices.map(({ color }, index) => {
            const share = shares[index];
            const start = shares.slice(0, index).reduce((sum, value) => sum + value, 0);
            return <circle key={color} cx={88} cy={88} r={69} pathLength={100} fill="none" stroke={color} strokeWidth={22} strokeDasharray={`${share - gap} ${100 - share + gap}`} strokeDashoffset={-(start + gap / 2)} />;
          })}
        </svg>
        <span className="allocation-center mock-donut-center"><strong className="amount">{centre}</strong><small>{label}</small></span>
      </div>
    </div>
  );
}

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mock-frame">
      <div className="mock-bar" aria-hidden="true">
        <BrandMark priority={false} />
        <span>{title}</span>
      </div>
      <div className="mock-body">{children}</div>
    </div>
  );
}

/** Hero preview: the overview as it is today. Net worth by group, this month, and six months of cash flow. */
export function OverviewMock({ locale }: Props) {
  const { mock: copy } = landingCopy[locale];
  const net = trend[5].income - trend[5].expense;
  const label = `${copy.chart}. ${trend.map(({ income, expense }, index) =>
    `${copy.months[6 + index]}: ${copy.income} ${formatEuros(income, locale)}, ${copy.expenses} ${formatEuros(expense, locale)}`).join("; ")}`;
  const groups = (["cash", "savings", "investments", "pension", "property"] as const).map((key) => ({ key, label: copy[key], cents: assets[key] }));
  const share = new Intl.NumberFormat(localeTags[locale], { style: "percent", maximumFractionDigits: 0 });

  return (
    <Frame title={copy.window}>
      <div className="mock-dash">
        <section className="card mock-worth-card" aria-hidden="true">
          <header className="card-head"><p className="mock-title">{copy.netWorth}</p></header>
          <Donut
            slices={groups.map(({ key, cents }) => ({ cents, color: groupColors[key] }))}
            centre={formatEuros(netWorthCents, locale, { wholeEuros: true })}
            label={copy.netWorth}
            summary={groups.map(({ label: name, cents }) => `${name} ${share.format(cents / grossCents)}`).join(", ")}
          />
          <ul className="rows asset-legend">
            {groups.map(({ key, label: name, cents }) => (
              <li className="data-row" key={key}>
                <span className="row-text"><i style={{ background: groupColors[key] }} />{name} <span>· {share.format(cents / grossCents)}</span></span>
                <span className="row-amount amount">{euros(cents, locale, { wholeEuros: true })}</span>
              </li>
            ))}
            <li className="data-row">
              <span className="row-text">{copy.debts}</span>
              <span className="row-amount amount">{euros(-mortgageCents, locale, { wholeEuros: true })}</span>
            </li>
          </ul>
        </section>
        <div className="mock-stack">
          <section className="card" aria-hidden="true">
            <p className="mock-title">{copy.thisMonth}</p>
            <ul className="rows summary-rows">
              <li className="data-row">
                <span className="row-icon tone-green"><Icon name="arrowDown" size={20} /></span>
                <span className="row-text">{copy.income}</span>
                <span className="row-amount amount positive">{euros(trend[5].income, locale, { showPlus: true })}</span>
              </li>
              <li className="data-row">
                <span className="row-icon tone-red"><Icon name="arrowUp" size={20} /></span>
                <span className="row-text">{copy.expenses}</span>
                <span className="row-amount amount">{euros(-trend[5].expense, locale)}</span>
              </li>
              <li className="data-row monthly-net">
                <span className="row-text">{copy.net}</span>
                <span className="row-amount amount positive">{euros(net, locale, { showPlus: true })}</span>
              </li>
            </ul>
          </section>
          <section className="card mock-chart-card">
            <header className="card-head">
              <p className="mock-title">{copy.income} / {copy.expenses}</p>
              <span className="period">6 {locale === "it" ? "mesi" : "months"}</span>
            </header>
            <CashFlowChart points={trend.map(({ income, expense }, index) => ({ label: copy.months[6 + index], incomeCents: income, expenseCents: expense }))} locale={locale} labels={{ income: copy.income, expenses: copy.expenses }} summary={label} />
          </section>
        </div>
      </div>
    </Frame>
  );
}

/** Cash-flow preview: budget bars (one over its limit) and the latest movements. */
export function BudgetMock({ locale }: Props) {
  const { mock: copy } = landingCopy[locale];
  const budgets = [
    { name: copy.groceries, spent: 41_260, limit: 45_000, color: "var(--brand)" },
    { name: copy.dining, spent: 18_640, limit: 15_000, color: "var(--warning)" },
    { name: copy.transport, spent: 6_420, limit: 12_000, color: "var(--chart-2)" },
  ];
  const rows = [
    { icon: "arrowUp", tone: "red", title: copy.supermarket, meta: `${copy.groceries} · ${copy.checking} · ${copy.today}`, cents: -6_420 },
    { icon: "arrowDown", tone: "green", title: copy.salary, meta: `${copy.incomeCategory} · ${copy.checking} · ${copy.yesterday}`, cents: 325_000 },
    { icon: "cashFlow", tone: "blue", title: copy.toSavings, meta: `${copy.transfer} · ${copy.checking} · ${shortDate(locale, "2026-11-19")}`, cents: -40_000 },
  ] as const;

  return (
    <Frame title={copy.window}>
      <div className="mock-stack">
        <section className="card" aria-hidden="true">
          <header className="card-head"><p className="mock-title">{copy.budget}</p></header>
          <ul className="budget-list">
            {budgets.map(({ name, spent, limit, color }) => {
              const over = spent > limit;
              return (
                <li key={name} className={`budget-row${over ? " budget-over" : ""}`} style={{ "--budget-color": over ? "var(--negative)" : color } as CSSProperties}>
                  <div className="budget-caption">
                    <span className="budget-name"><i />{name}</span>
                    <span className="amount budget-amount"><strong>{euros(spent, locale)}</strong> / {euros(limit, locale, { wholeEuros: true })}</span>
                  </div>
                  <progress value={Math.min(spent, limit)} max={limit} aria-label={name} />
                  {over && <p className="mock-flag">▲ {euros(spent - limit, locale)} {copy.over}</p>}
                </li>
              );
            })}
          </ul>
        </section>
        <section className="card" aria-hidden="true">
          <header className="card-head"><p className="mock-title">{copy.latest}</p></header>
          <ul className="rows">
            {rows.map(({ icon, tone, title, meta, cents }) => (
              <li className="data-row" key={title}>
                <span className={`row-icon tone-${tone}`}><Icon name={icon} size={20} /></span>
                <div className="row-text"><p>{title}</p><span>{meta}</span></div>
                <span className={`row-amount amount${cents > 0 ? " positive" : ""}`}>{euros(cents, locale, { showPlus: true })}</span>
              </li>
            ))}
            <li className="data-row">
              <span className="row-icon tone-amber"><Icon name="recurring" size={20} /></span>
              <div className="row-text"><p>{copy.electricity}</p><span>{copy.due} {shortDate(locale, "2026-11-22")}</span></div>
              <span className="row-amount amount">{euros(-8_640, locale)}</span>
            </li>
          </ul>
        </section>
      </div>
    </Frame>
  );
}

/** Net worth preview: the trend card's own markup and classes with a one-year line drawn as SVG, and the two totals. */
export function NetWorthMock({ locale }: Props) {
  const { mock: copy } = landingCopy[locale];
  const first = worthSeries[0].cents;
  const change = netWorthCents - first;
  const low = Math.min(...worthSeries.map(({ cents }) => cents));
  const high = Math.max(...worthSeries.map(({ cents }) => cents));
  const pad = (high - low) * 0.15;
  const x = (index: number) => ((index / (worthSeries.length - 1)) * 450).toFixed(1);
  const y = (cents: number) => (130 - ((cents - low + pad) / (high - low + 2 * pad)) * 130).toFixed(1);
  const line = worthSeries.map(({ cents }, index) => `${index ? "L" : "M"}${x(index)},${y(cents)}`).join(" ");
  const month = (date: string) => new Intl.DateTimeFormat(localeTags[locale], { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
  const value = formatEuros(netWorthCents, locale);
  const ranges = ["1M", "3M", "YTD", locale === "it" ? "1A" : "1Y", "Max"];

  return (
    <Frame title={copy.window}>
      <div className="mock-stack" role="img" aria-label={`${copy.netWorth}: ${value}`}>
        <section className="card trend-card" data-tone="positive" aria-hidden="true">
          <div className="trend-head">
            <div>
              <p className="hero-label">{copy.netWorth}</p>
              <p className="trend-value amount">{value.slice(0, -3)}<small>{value.slice(-3)}</small></p>
              <p className="trend-change amount">
                <span className="trend-arrow"><Icon name="arrowUp" size={14} /></span>
                <span>{signedPercent(locale, change / first)} ({euros(change, locale, { showPlus: true })})</span>
                <span className="trend-period"> · {copy.lastYear}</span>
              </p>
            </div>
            <div className="trend-ranges">
              {ranges.map((name, index) => <span key={name} className="mock-range" aria-current={index === 3 || undefined}>{name}</span>)}
            </div>
          </div>
          <div className="mock-trend-plot">
            <svg viewBox="0 0 450 130" preserveAspectRatio="none">
              <defs><linearGradient id="mock-worth-fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--trend-color)" stopOpacity={0.26} /><stop offset="1" stopColor="var(--trend-color)" stopOpacity={0} /></linearGradient></defs>
              {[0.25, 0.55, 0.85].map((at) => <line key={at} x1="0" x2="450" y1={at * 130} y2={at * 130} stroke="var(--glass-hairline)" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />)}
              <path d={`${line} L450,130 L0,130 Z`} fill="url(#mock-worth-fade)" />
              <path d={line} fill="none" stroke="var(--trend-color)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </svg>
            <div className="mock-trend-months"><span>{month(worthSeries[0].date)}</span><span>{month(worthSeries[Math.floor(worthSeries.length / 2)].date)}</span><span>{month(MOCK_TODAY)}</span></div>
          </div>
          <p className="hint trend-note">{copy.trendNote}</p>
        </section>
        <dl className="mock-totals" aria-hidden="true">
          <div className="card"><dt>{copy.assets}</dt><dd className="amount">{euros(grossCents, locale)}</dd></div>
          <div className="card"><dt>{copy.liabilities}</dt><dd className="amount">{euros(-mortgageCents, locale)}</dd></div>
        </dl>
      </div>
    </Frame>
  );
}

/** Investments preview: value and gain, the portfolio next to the S&P 500, allocation and two holdings. */
export function InvestmentsMock({ locale }: Props) {
  const { mock: copy } = landingCopy[locale];
  const total = assets.investments;
  const gain = 312_400;
  const segments = [
    { name: copy.funds, share: 62, color: "var(--brand)" },
    { name: copy.bonds, share: 28, color: "var(--chart-2)" },
    { name: copy.cash, share: 10, color: "var(--warning)" },
  ];
  const holdings = [
    { icon: "investments", tone: "blue", name: copy.funds, meta: `120 ${copy.shares} · ${copy.avgCost} ${formatEuros(9_840, locale)}`, value: 1_488_000, change: 0.148 },
    { icon: "bills", tone: "teal", name: copy.bonds, meta: `${copy.avgCost} ${formatEuros(9_910, locale)}`, value: 672_000, change: 0.024 },
  ] as const;
  const gainRate = gain / (total - gain);
  const market = [
    { name: copy.portfolio, close: 0.0042, ytd: gainRate },
    { name: copy.sp500, close: -0.0017, ytd: 0.1182 },
  ];

  return (
    <Frame title={copy.window}>
      <section className="card" aria-hidden="true">
        <header className="card-head"><p className="mock-title">{copy.investments}</p></header>
        <p className="mock-big amount">{euros(total, locale)}</p>
        <p className="mock-sub">{copy.unrealised} <span className="amount positive">{euros(gain, locale, { showPlus: true })}</span> (<span className="amount positive">{signedPercent(locale, gainRate)}</span>)</p>
        <table className="market-table">
          <thead><tr><td /><th scope="col">{copy.lastClose}</th><th scope="col">{copy.yearToDate}</th></tr></thead>
          <tbody>
            {market.map(({ name, close, ytd }) => (
              <tr key={name}>
                <th scope="row">{name}</th>
                <td><span className={`amount ${close < 0 ? "negative" : "positive"}`}>{signedPercent(locale, close)}</span></td>
                <td><span className="amount positive">{signedPercent(locale, ytd)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="allocation" style={{ marginBlock: "16px 12px" }}>
          {segments.map(({ name, share, color }) => <span key={name} style={{ flexGrow: share, background: color }} />)}
        </div>
        <ul className="allocations">
          {segments.map(({ name, share, color }) => (
            <li key={name}><span style={{ "--segment": color } as CSSProperties}><i />{name}</span><span className="amount">{share}%</span></li>
          ))}
        </ul>
        <ul className="rows">
          {holdings.map(({ icon, tone, name, meta, value, change }) => (
            <li className="data-row" key={name}>
              <span className={`row-icon tone-${tone}`}><Icon name={icon} size={20} /></span>
              <div className="row-text"><p>{name}</p><span>{meta}</span></div>
              <span className="row-amount amount">{euros(value, locale)}<br /><small className="positive">▲ {percent(locale, change, false)}</small></span>
            </li>
          ))}
        </ul>
      </section>
    </Frame>
  );
}

/** Property preview: equity, three utility bills in three states, and a condominium instalment. */
export function PropertyMock({ locale }: Props) {
  const { mock: copy } = landingCopy[locale];
  const valuation = assets.property;
  const bills = [
    { icon: "bills", tone: "teal", name: copy.gas, meta: `${copy.paid} · ${shortDate(locale, "2026-10-31")}`, status: "paid", label: copy.paid, cents: -9_480 },
    { icon: "recurring", tone: "amber", name: copy.electricity, meta: `${copy.due} ${shortDate(locale, "2026-12-05")}`, status: "due", label: copy.statusDue, cents: -8_640 },
    { icon: "bills", tone: "red", name: copy.internet, meta: `${copy.due} ${shortDate(locale, "2026-11-18")}`, status: "overdue", label: copy.overdue, cents: -2_990 },
  ] as const;

  return (
    <Frame title={copy.window}>
      <div className="mock-stack">
        <section className="card" aria-hidden="true">
          <header className="card-head"><p className="mock-title">{copy.flat}</p><span className="period">{copy.share} 100%</span></header>
          <p className="mock-label">{copy.equityValue}</p>
          <p className="mock-big amount">{euros(valuation - mortgageCents, locale)}</p>
          <ul className="rows">
            <li className="data-row">
              <span className="row-icon tone-blue"><Icon name="home" size={20} /></span>
              <span className="row-text">{copy.valuation}</span>
              <span className="row-amount amount">{euros(valuation, locale)}</span>
            </li>
            <li className="data-row">
              <span className="row-icon tone-red"><Icon name="accounts" size={20} /></span>
              <span className="row-text">{copy.mortgage}</span>
              <span className="row-amount amount">{euros(-mortgageCents, locale)}</span>
            </li>
          </ul>
        </section>
        <section className="card" aria-hidden="true">
          <header className="card-head"><p className="mock-title">{copy.bills}</p></header>
          <ul className="rows">
            {bills.map(({ icon, tone, name, meta, status, label, cents }) => (
              <li className="data-row" key={name}>
                <span className={`row-icon tone-${tone}`}><Icon name={icon} size={20} /></span>
                <div className="row-text"><p>{name}</p><span>{meta}</span></div>
                <span className="row-amount amount">{euros(cents, locale)}<br /><small className={`mock-status mock-status-${status}`}>{label}</small></span>
              </li>
            ))}
            <li className="data-row">
              <span className="row-icon tone-amber"><Icon name="recurring" size={20} /></span>
              <div className="row-text"><p>{copy.condo}</p><span>{copy.due} {shortDate(locale, "2026-11-30")}</span></div>
              <span className="row-amount amount">{euros(-31_200, locale)}</span>
            </li>
          </ul>
        </section>
      </div>
    </Frame>
  );
}
