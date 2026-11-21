import type { CSSProperties } from "react";
import { formatEuros, localeTags, type Locale } from "@/server/locale";
import { BrandMark } from "../brand-mark";
import { Icon } from "../icon";
import { landingCopy } from "./copy";
import { euros } from "@/components/euros";

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
const chartCap = 400_000;

/** Twelve month-end net worth values, in cents. */
const worth = [16_240_000, 16_390_000, 16_510_000, 16_480_000, 16_720_000, 16_890_000, 17_010_000, 17_240_000, 17_330_000, 17_610_000, 17_920_000, 18_425_000];

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

/** Hero preview: the monthly net, six months of cash flow and the net worth. */
export function OverviewMock({ locale }: Props) {
  const { mock: copy } = landingCopy[locale];
  const net = trend[5].income - trend[5].expense;
  const height = (cents: number) => `${(cents / chartCap) * 100}%`;
  const label = `${copy.chart}. ${trend.map(({ income, expense }, index) =>
    `${copy.months[6 + index]}: ${copy.income} ${formatEuros(income, locale)}, ${copy.expenses} ${formatEuros(expense, locale)}`).join("; ")}`;

  return (
    <Frame title={copy.window}>
      <div className="mock-grid">
        <section className="card" aria-hidden="true">
          <p className="mock-label">{copy.net}</p>
          <p className="mock-big amount">{euros(net, locale, { showPlus: true })}</p>
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
          </ul>
        </section>
        <section className="card">
          <header className="card-head">
            <p className="mock-title">{copy.income} / {copy.expenses}</p>
            <span className="period">6 {locale === "it" ? "mesi" : "months"}</span>
          </header>
          <div className="cash-chart" role="img" aria-label={label}>
            <div className="cash-axis" aria-hidden="true">
              {[chartCap, chartCap / 2, 0].map((tick) => <span key={tick}>{euros(tick, locale, { wholeEuros: true })}</span>)}
            </div>
            <div className="cash-plot" aria-hidden="true">
              {trend.map(({ income, expense }, index) => (
                <div className={`cash-month${index === 5 ? " cash-current" : ""}`} key={index}>
                  <div className="cash-bars">
                    <div className="cash-bar income-bar" style={{ height: height(income) }} />
                    <div className="cash-bar expense-bar" style={{ height: height(expense) }} />
                  </div>
                  <span>{copy.months[6 + index]}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
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

/** Net worth preview: the dark hero card with a twelve-month line that draws itself on scroll. */
export function NetWorthMock({ locale }: Props) {
  const { mock: copy } = landingCopy[locale];
  const last = worth[worth.length - 1];
  const previous = worth[worth.length - 2];
  const min = Math.min(...worth);
  const max = Math.max(...worth);
  // 450 x 100 user units, close to the plot's real shape, so the stroke barely stretches and `pathLength` dashes stay exact.
  const point = (value: number, index: number) => `${((index / (worth.length - 1)) * 450).toFixed(1)},${(92 - ((value - min) / (max - min)) * 84).toFixed(1)}`;
  const path = `M${worth.map(point).join(" L")}`;

  return (
    <Frame title={copy.window}>
      <section className="card net-worth mock-worth">
        <span className="net-worth-icon" aria-hidden="true"><Icon name="netWorth" size={20} /></span>
        <p className="net-worth-label">{copy.netWorth}</p>
        <p className="net-worth-amount amount">{euros(last, locale, { wholeEuros: true })}</p>
        <p className="trend">
          <span className="trend-chip">▲ {percent(locale, (last - previous) / previous, false)}</span>
          {copy.vsLast}
        </p>
        <div className="net-worth-chart" role="img" aria-label={copy.trend}>
          <div className="net-worth-plot" aria-hidden="true">
            <svg viewBox="0 0 450 100" preserveAspectRatio="none">
              <path className="worth-line" d={path} pathLength={1} fill="none" stroke="#9db6ff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="net-worth-months" aria-hidden="true">
            <span>{copy.months[0]}</span><span>{copy.months[5]}</span><span>{copy.months[11]}</span>
          </div>
        </div>
      </section>
    </Frame>
  );
}

/** Investments preview: allocation bar and three holdings. */
export function InvestmentsMock({ locale }: Props) {
  const { mock: copy } = landingCopy[locale];
  const total = 2_400_000;
  const segments = [
    { name: copy.equity, share: 62, color: "var(--brand)" },
    { name: copy.bonds, share: 28, color: "var(--chart-2)" },
    { name: copy.cash, share: 10, color: "var(--warning)" },
  ];
  const holdings = [
    { icon: "investments", tone: "blue", name: copy.funds, meta: `120 ${copy.shares} · ${copy.avgCost} ${formatEuros(9_840, locale)}`, value: 1_356_000, change: 0.148 },
    { icon: "bills", tone: "teal", name: copy.bonds, meta: `${copy.avgCost} ${formatEuros(9_910, locale)}`, value: 1_024_000, change: 0.024 },
  ] as const;

  return (
    <Frame title={copy.window}>
      <section className="card" aria-hidden="true">
        <header className="card-head"><p className="mock-title">{copy.portfolio}</p></header>
        <p className="mock-big amount">{euros(total, locale)}</p>
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

/** Property preview: valuation, mortgage, equity and two condominium charges. */
export function PropertyMock({ locale }: Props) {
  const { mock: copy } = landingCopy[locale];
  const valuation = 24_500_000;
  const mortgage = 11_840_000;

  return (
    <Frame title={copy.window}>
      <div className="mock-stack">
        <section className="card" aria-hidden="true">
          <header className="card-head"><p className="mock-title">{copy.flat}</p><span className="period">{copy.share} 100%</span></header>
          <p className="mock-label">{copy.equityValue}</p>
          <p className="mock-big amount">{euros(valuation - mortgage, locale)}</p>
          <ul className="rows">
            <li className="data-row">
              <span className="row-icon tone-blue"><Icon name="home" size={20} /></span>
              <span className="row-text">{copy.valuation}</span>
              <span className="row-amount amount">{euros(valuation, locale)}</span>
            </li>
            <li className="data-row">
              <span className="row-icon tone-red"><Icon name="accounts" size={20} /></span>
              <span className="row-text">{copy.mortgage}</span>
              <span className="row-amount amount">{euros(-mortgage, locale)}</span>
            </li>
          </ul>
        </section>
        <section className="card" aria-hidden="true">
          <header className="card-head"><p className="mock-title">{copy.condoTitle}</p></header>
          <ul className="rows">
            <li className="data-row">
              <span className="row-icon tone-amber"><Icon name="recurring" size={20} /></span>
              <div className="row-text"><p>{copy.condo}</p><span>{copy.due} {shortDate(locale, "2026-11-30")}</span></div>
              <span className="row-amount amount">{euros(-31_200, locale)}</span>
            </li>
            <li className="data-row">
              <span className="row-icon tone-amber"><Icon name="bills" size={20} /></span>
              <div className="row-text"><p>{copy.heating}</p><span>{copy.due} {shortDate(locale, "2026-12-15")}</span></div>
              <span className="row-amount amount">{euros(-64_000, locale)}</span>
            </li>
          </ul>
        </section>
      </div>
    </Frame>
  );
}
