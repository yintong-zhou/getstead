import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { formatEuros, localeTags, type getDemoDashboard, type Locale } from "@/server/demo-dashboard";
import { dashboardCopy } from "./dashboard-copy";
import { Icon } from "./icon";

type DashboardData = ReturnType<typeof getDemoDashboard>;
type Copy = (typeof dashboardCopy)[Locale];

const sections = [
  { id: "overview", icon: "overview" },
  { id: "cash-flow", icon: "cashFlow" },
  { id: "net-worth", icon: "netWorth" },
  { id: "investments", icon: "investments" },
  { id: "home", icon: "home" },
] as const;

const activityTones = {
  groceries: "blue",
  transport: "teal",
  income: "green",
  bills: "amber",
  dining: "amber",
  shopping: "blue",
} as const;

function formatMonth(month: string, locale: Locale, monthStyle: "short" | "long") {
  return new Intl.DateTimeFormat(localeTags[locale], {
    month: monthStyle,
    year: monthStyle === "long" ? "numeric" : undefined,
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
}

function formatDay(month: string, day: number, locale: Locale) {
  const date = `${month}-${String(day).padStart(2, "0")}`;
  return new Intl.DateTimeFormat(localeTags[locale], { day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(`${date}T00:00:00Z`));
}

function NetWorth({ values, locale, copy }: { values: DashboardData["netWorth"]; locale: Locale; copy: Copy }) {
  const amounts = values.map(({ cents }) => cents);
  const low = Math.min(...amounts);
  const high = Math.max(...amounts);
  const points = values.map(({ cents }, index) => ({
    x: 1 + index * 98 / (values.length - 1),
    y: 86 - (cents - low) * 70 / (high - low),
  }));
  const line = points.map(({ x, y }) => `${x},${y}`).join(" ");
  const last = points.at(-1)!;
  const currentCents = amounts.at(-1)!;
  const changeCents = currentCents - amounts.at(-2)!;

  return (
    <section id="net-worth" className="net-worth card" aria-labelledby="net-worth-title">
      <div className="card-head">
        <h2 id="net-worth-title" className="net-worth-label">{copy.netWorth}</h2>
        <span className="net-worth-icon"><Icon name="netWorth" size={20} /></span>
      </div>
      <p className="net-worth-amount amount">{formatEuros(currentCents, locale, { wholeEuros: true })}</p>
      <div className="trend">
        <span className="trend-chip">
          <Icon name="arrowUp" size={14} />
          <span className="amount">{formatEuros(changeCents, locale, { showPlus: true, wholeEuros: true })}</span>
        </span>
        <span>{copy.lastMonth}</span>
      </div>
      <div className="net-worth-chart" role="img" aria-label={`${copy.netWorthTrend}. ${values.map(
        ({ month, cents }) => `${formatMonth(month, locale, "short")} ${formatEuros(cents, locale, { wholeEuros: true })}`,
      ).join(", ")}`}>
        <div className="net-worth-plot" aria-hidden="true">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <linearGradient id="net-worth-fill" x2="0" y2="1">
                <stop stopColor="#9DB6FF" stopOpacity=".34" />
                <stop offset="1" stopColor="#9DB6FF" stopOpacity=".02" />
              </linearGradient>
            </defs>
            <polygon points={`1,100 ${line} 99,100`} fill="url(#net-worth-fill)" />
            <polyline points={line} fill="none" stroke="#9DB6FF" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          <span className="net-worth-point" style={{ left: `${last.x}%`, top: `${last.y}%` }} />
        </div>
        <div className="net-worth-months" aria-hidden="true">
          {values.map(({ month }) => <span key={month}>{formatMonth(month, locale, "short")}</span>)}
        </div>
      </div>
    </section>
  );
}

function CashFlow({ values, locale, copy }: { values: DashboardData["cashFlow"]; locale: Locale; copy: Copy }) {
  const capCents = 500_000;
  const ticks = [capCents, capCents / 2, 0];

  return (
    <section id="cash-flow" className="cash-flow card" aria-labelledby="cash-flow-title">
      <header className="card-head">
        <h2 id="cash-flow-title">{copy.cashFlow}</h2>
        <span className="period">{copy.sixMonths}</span>
      </header>
      <div className="cash-chart" role="img" aria-label={`${copy.cashFlowTrend}. ${values.map(
        ({ month, incomeCents, expenseCents }) => `${formatMonth(month, locale, "short")}: ${copy.income} ${formatEuros(incomeCents, locale)}, ${copy.expenses} ${formatEuros(expenseCents, locale)}`,
      ).join("; ")}`}>
        <div className="cash-axis" aria-hidden="true">
          {ticks.map((tick) => <span key={tick}>{formatEuros(tick, locale, { wholeEuros: true })}</span>)}
        </div>
        <div className="cash-plot" aria-hidden="true">
          {values.map(({ month, incomeCents, expenseCents }, index) => (
            <div className={`cash-month${index === values.length - 1 ? " cash-current" : ""}`} key={month}>
              <div className="cash-bars">
                <div className="cash-bar income-bar" style={{ height: `${incomeCents / capCents * 100}%` }} />
                <div className="cash-bar expense-bar" style={{ height: `${expenseCents / capCents * 100}%` }} />
              </div>
              <span>{formatMonth(month, locale, "short")}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="chart-legend" aria-hidden="true">
        <span><i className="income-bar" />{copy.income}</span>
        <span><i className="expense-bar" />{copy.expenses}</span>
      </div>
    </section>
  );
}

function ActivityRow({ item, locale, month, copy }: {
  item: DashboardData["transactions"][number]; locale: Locale; month: string; copy: Copy;
}) {
  return (
    <li className="data-row">
      <span className={`row-icon tone-${activityTones[item.category]}`}><Icon name={item.category} size={20} /></span>
      <div className="row-text">
        <p>{item.name[locale]}</p>
        <span>{copy.categories[item.category]} · {formatDay(month, item.day, locale)}</span>
      </div>
      <span className={`row-amount amount${item.amountCents > 0 ? " positive" : ""}`}>
        {formatEuros(item.amountCents, locale, { showPlus: true })}
      </span>
    </li>
  );
}

export function Dashboard({ locale, data, toolbar }: { locale: Locale; data: DashboardData; toolbar?: ReactNode }) {
  const copy = dashboardCopy[locale];
  const alternativeLocale = locale === "en" ? "it" : "en";
  const languageName = alternativeLocale === "it" ? "Italiano" : "English";
  const summary = [
    { name: copy.income, cents: data.incomeCents, icon: "arrowDown", tone: "green" },
    { name: copy.expenses, cents: -data.expenseCents, icon: "arrowUp", tone: "red" },
    { name: copy.monthlyBalance, cents: data.monthlyBalanceCents, icon: "cashFlow", tone: "blue" },
  ] as const;

  return (
    <div className="workspace">
      <a className="skip-link" href="#main">{copy.skip}</a>
      <aside className="sidebar">
        <div className="wordmark"><span className="brand-mark" aria-hidden="true">S</span><span>Stead</span></div>
        <nav className="navigation" aria-label={copy.navigation}>
          {sections.map(({ id, icon }) => (
            <a key={id} className={`nav-item nav-${id}`} href={`#${id}`} title={copy[icon]}>
              <Icon name={icon} />
              <span>{copy[icon]}</span>
            </a>
          ))}
        </nav>
      </aside>

      <main id="main" className="main-content" tabIndex={-1}>
        <div id="overview" className="page">
          <header className="page-head">
            <div className="utility-bar">
              <div className="wordmark mobile-wordmark"><span className="brand-mark" aria-hidden="true">S</span><span>Stead</span></div>
              <span className="demo-label"><span aria-hidden="true" />{copy.demo}</span>
              <Link className="language-link" href={`/${alternativeLocale}`} lang={alternativeLocale} hrefLang={alternativeLocale} aria-label={`${copy.language}: ${languageName}`}>
                {alternativeLocale.toUpperCase()}
              </Link>
              {toolbar}
            </div>
            <div className="page-title-row">
              <div>
                <h1>{copy.overview}</h1>
                <p className="month-label"><Icon name="calendar" size={16} /><time dateTime={data.month}>{formatMonth(data.month, locale, "long")}</time></p>
              </div>
              <a className="primary-link" href="#activity">{copy.viewActivity}<Icon name="arrowRight" size={17} /></a>
            </div>
          </header>

          <div className="dashboard-grid">
            <NetWorth values={data.netWorth} locale={locale} copy={copy} />

            <section className="card monthly" aria-labelledby="monthly-title">
              <h2 id="monthly-title">{copy.thisMonth}</h2>
              <ul className="rows summary-rows">
                {summary.map(({ name, cents, icon, tone }) => (
                  <li className="data-row" key={name}>
                    <span className={`row-icon tone-${tone}`}><Icon name={icon} size={20} /></span>
                    <span className="row-text">{name}</span>
                    <span className={`row-amount amount${tone === "green" ? " positive" : ""}`}>
                      {formatEuros(cents, locale, { showPlus: tone === "green" })}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <CashFlow values={data.cashFlow} locale={locale} copy={copy} />

            <section className="card budget" aria-labelledby="budget-title">
              <h2 id="budget-title">{copy.budget}</h2>
              <ul className="budget-list">
                {data.budgets.map(({ category, spentCents, limitCents }) => {
                  const name = copy.categories[category];
                  return (
                    <li key={category} className={`budget-row budget-${category}`}>
                      <div className="budget-caption">
                        <span className="budget-name"><i aria-hidden="true" />{name}</span>
                        <span className="amount budget-amount"><strong>{formatEuros(spentCents, locale)}</strong> / {formatEuros(limitCents, locale, { wholeEuros: true })}</span>
                      </div>
                      <progress value={spentCents} max={limitCents} aria-label={name} />
                    </li>
                  );
                })}
              </ul>
            </section>

            <section id="activity" className="card activity" aria-labelledby="activity-title">
              <h2 id="activity-title">{copy.recentActivity}</h2>
              <ul className="rows">
                {data.transactions.slice(0, 4).map((item) => <ActivityRow key={item.id} item={item} month={data.month} locale={locale} copy={copy} />)}
              </ul>
              <details className="all-activity">
                <summary>{copy.allTransactions}<Icon name="chevron" size={16} /></summary>
                <ul className="rows">
                  {data.transactions.slice(4).map((item) => <ActivityRow key={item.id} item={item} month={data.month} locale={locale} copy={copy} />)}
                </ul>
              </details>
            </section>

            <div className="secondary-cards">
              <section id="home" className="card" aria-labelledby="home-title">
                <h2 id="home-title">{copy.upcomingBills}</h2>
                <ul className="rows">
                  {data.bills.map(({ id, name, day, amountCents }) => (
                    <li className="data-row" key={id}>
                      <span className={`row-icon tone-${id === "electricity" ? "amber" : "blue"}`}><Icon name={id} size={20} /></span>
                      <div className="row-text"><p>{name[locale]}</p><span>{copy.due} {formatDay(data.month, day, locale)}</span></div>
                      <span className="row-amount amount">{formatEuros(-amountCents, locale)}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section id="investments" className="card" aria-labelledby="investments-title">
                <div className="card-head">
                  <h2 id="investments-title">{copy.investments}</h2>
                  <Icon name="investments" size={20} />
                </div>
                <p className="portfolio-label">{copy.portfolioValue}</p>
                <p className="portfolio-amount amount">{formatEuros(data.investmentCents, locale, { wholeEuros: true })}</p>
                <div className="allocation" aria-hidden="true">
                  {data.holdings.map(({ id, amountCents }) => (
                    <span key={id} style={{ flexGrow: amountCents }} />
                  ))}
                </div>
                <ul className="allocations">
                  {data.holdings.map(({ id, name, amountCents }, index) => (
                    <li key={id} style={{ "--segment": index ? "var(--chart-2)" : "var(--brand)" } as CSSProperties}>
                      <span><i aria-hidden="true" />{name[locale]}</span>
                      <span className="amount">{formatEuros(amountCents, locale, { wholeEuros: true })}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
