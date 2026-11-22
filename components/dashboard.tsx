import Link from "next/link";
import type { CSSProperties } from "react";
import type { DashboardData } from "@/server/cash-flow/dashboard";
import type { Profile } from "@/server/profile/service";
import { formatEuros, type Locale } from "@/server/locale";
import { AppShell } from "./app-shell";
import { dashboardCopy, type DashboardCopy } from "./dashboard-copy";
import { formatDay, formatMonth } from "./format";
import { categoryIcon } from "./category-icon";
import { Icon } from "./icon";
import { euros } from "@/components/euros";

const palette = ["var(--brand)", "var(--chart-2)", "var(--warning)", "#a855f7", "#f43f5e"];

/** The smallest 1, 2 or 5 times a power of ten that holds the tallest bar, never below 100 euros. */
function chartCap(maxCents: number) {
  for (let magnitude = 10_000; ; magnitude *= 10) {
    for (const step of [1, 2, 5]) if (step * magnitude >= maxCents) return step * magnitude;
  }
}

function CashFlow({ values, locale, copy }: { values: DashboardData["trend"]; locale: Locale; copy: DashboardCopy }) {
  // A month where refunds exceed spending has a negative net expense: its bar is drawn at that size
  // as an outlined "refund" bar and named in the note below, so the dip is never silently flattened.
  const cap = chartCap(Math.max(...values.flatMap(({ incomeCents, expenseCents }) => [incomeCents, Math.abs(expenseCents)])));
  const height = (cents: number) => `${Math.min(100, Math.max(0, (Math.abs(cents) / cap) * 100))}%`;
  const refundMonths = values.filter(({ expenseCents }) => expenseCents < 0);

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
          {[cap, cap / 2, 0].map((tick) => <span key={tick}>{euros(tick, locale, { wholeEuros: true })}</span>)}
        </div>
        <div className="cash-plot" aria-hidden="true">
          {values.map(({ month, incomeCents, expenseCents }, index) => (
            <div className={`cash-month${index === values.length - 1 ? " cash-current" : ""}`} key={month}>
              <div className="cash-bars">
                <div className="cash-bar income-bar" style={{ height: height(incomeCents) }} />
                <div className={`cash-bar expense-bar${expenseCents < 0 ? " refund-bar" : ""}`} style={{ height: height(expenseCents) }} />
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
      {refundMonths.length > 0 && (
        <p className="hint refund-note">
          {copy.refundsExceed} {refundMonths.map(({ month, expenseCents }) => `${formatMonth(month, locale, "short")} ${formatEuros(expenseCents, locale)}`).join(" · ")}
        </p>
      )}
    </section>
  );
}

function ActivityRow({ item, locale, today, copy }: {
  item: DashboardData["latest"][number]; locale: Locale; today: string; copy: DashboardCopy;
}) {
  const tone = item.isTransfer ? "blue" : item.amountCents > 0 ? "green" : "red";
  const icon = item.isTransfer ? "cashFlow"
    : item.categoryName ? categoryIcon(item.categoryName, item.amountCents > 0 ? "INCOME" : "EXPENSE")
    : item.amountCents > 0 ? "arrowDown" : "arrowUp";
  const label = item.isTransfer ? copy.transfer : item.categoryName ?? copy.noCategory;

  return (
    <li className="data-row">
      <span className={`row-icon tone-${tone}`}><Icon name={icon} size={20} /></span>
      <div className="row-text">
        <p>{item.description}</p>
        <span>{label} · {item.accountName} · {formatDay(item.bookingDate, locale, today, copy)}</span>
      </div>
      <span className={`row-amount amount${item.amountCents > 0 ? " positive" : ""}`}>
        {euros(item.amountCents, locale, { showPlus: true })}
      </span>
    </li>
  );
}

export function Dashboard({ locale, data, profile }: { locale: Locale; data: DashboardData; profile: Profile }) {
  const copy = dashboardCopy[locale];
  const summary = [
    { name: copy.income, cents: data.incomeCents, icon: "arrowDown", tone: "green" },
    { name: copy.expenses, cents: -data.expenseCents, icon: "arrowUp", tone: "red" },
  ] as const;
  const refundsExceed = data.expenseCents < 0;

  return (
    <AppShell
      profile={profile}
      locale={locale}
      current="overview"
      title={copy.overview}
      subtitle={<><Icon name="calendar" size={16} /><time dateTime={data.month}>{formatMonth(data.month, locale, "long")}</time></>}
      action={data.hasAccounts && data.hasMovements && (
        <Link className="primary-link" href={`/${locale}/cash-flow#new`}>
          <Icon name="plus" size={17} />{copy.newMovement}
        </Link>
      )}
    >
      {data.showNetWorth && <section className="card dashboard-worth" aria-labelledby="dashboard-worth-title">
        <header className="card-head">
          <h2 id="dashboard-worth-title">{copy.netWorth}</h2>
          <Link className="text-link" href={`/${locale}/net-worth`}>{copy.seeAll}</Link>
        </header>
        <p className="amount">{euros(data.netWorthCents, locale)}</p>
      </section>}
      {!data.hasAccounts ? (
        <section className="card onboarding" aria-labelledby="onboarding-title">
          <h2 id="onboarding-title">{copy.firstAccountTitle}</h2>
          <p>{copy.firstAccountBody}</p>
          <Link className="primary-link" href={`/${locale}/accounts`}><Icon name="plus" size={17} />{copy.firstAccountAction}</Link>
        </section>
      ) : (
        <>
          {!data.hasMovements && (
            <section className="card onboarding" aria-labelledby="onboarding-title">
              <h2 id="onboarding-title">{copy.firstMovementTitle}</h2>
              <p>{copy.firstMovementBody}</p>
              <Link className="primary-link" href={`/${locale}/cash-flow#new`}><Icon name="plus" size={17} />{copy.newMovement}</Link>
            </section>
          )}

          <div className="dashboard-grid">
            <section className="card hero" aria-labelledby="hero-title">
              <h2 id="hero-title" className="hero-label">{copy.monthlyNet}</h2>
              <p className="hero-amount amount">{euros(data.monthlyNetCents, locale, { showPlus: true })}</p>
              <p className="hero-note">{copy.netNote}</p>
            </section>

            <section className="card monthly" aria-labelledby="monthly-title">
              <h2 id="monthly-title">{copy.thisMonth}</h2>
              <ul className="rows summary-rows">
                {summary.map(({ name, cents, icon, tone }) => (
                  <li className="data-row" key={name}>
                    <span className={`row-icon tone-${tone}`}><Icon name={icon} size={20} /></span>
                    <span className="row-text">{name}</span>
                    <span className={`row-amount amount${cents > 0 ? " positive" : ""}`}>
                      {euros(cents, locale, { showPlus: cents > 0 })}
                    </span>
                  </li>
                ))}
              </ul>
              {refundsExceed && <p className="hint refund-note">{copy.refundsExceed}</p>}
            </section>

            <CashFlow values={data.trend} locale={locale} copy={copy} />

            <section className="card budget" aria-labelledby="budget-title">
              <header className="card-head">
                <h2 id="budget-title">{copy.monthlyBudget}</h2>
                <Link className="text-link" href={`/${locale}/budget`}>{copy.seeAll}</Link>
              </header>
              {data.budgets.length === 0 ? (
                <div className="empty-inline">
                  <p>{copy.budgetEmpty}</p>
                  <Link className="text-link" href={`/${locale}/budget`}>{copy.budgetAction}</Link>
                </div>
              ) : (
                <ul className="budget-list">
                  {data.budgets.map(({ categoryId, name, spentCents, limitCents, varianceCents }, index) => {
                    const over = (varianceCents ?? 0) < 0;
                    return (
                      <li key={categoryId} className={`budget-row${over ? " budget-over" : ""}`} style={over ? undefined : ({ "--budget-color": palette[index % palette.length] } as CSSProperties)}>
                        <div className="budget-caption">
                          <span className="budget-name"><i aria-hidden="true" />{name}</span>
                          <span className="amount budget-amount">
                            <strong>{euros(spentCents, locale)}</strong> / {euros(limitCents ?? 0, locale, { wholeEuros: true })}
                          </span>
                        </div>
                        <progress value={Math.max(0, Math.min(spentCents, limitCents ?? 0))} max={Math.max(limitCents ?? 0, 1)} aria-label={name} />
                        {over && <p className="budget-flag">▲ {euros(-(varianceCents ?? 0), locale)} {copy.over}</p>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {data.latest.length > 0 && (
            <section id="activity" className="card activity" aria-labelledby="activity-title">
              <header className="card-head">
                <h2 id="activity-title">{copy.recentActivity}</h2>
                <Link className="text-link" href={`/${locale}/cash-flow`}>{copy.seeAll}</Link>
              </header>
              <ul className="rows">
                {data.latest.map((item) => <ActivityRow key={item.id} item={item} today={data.today} locale={locale} copy={copy} />)}
              </ul>
            </section>
            )}

            {data.dueCount > 0 && (
              <section className="card" aria-labelledby="due-title">
                <header className="card-head">
                  <h2 id="due-title">{copy.recurringTitle}</h2>
                  <Link className="text-link" href={`/${locale}/recurring`}>{copy.recurringAction}</Link>
                </header>
                <p className="hero-note">{copy.recurringBody(data.dueCount)}</p>
                <ul className="rows">
                  {data.due.map((item) => (
                    <li className="data-row" key={`${item.description}-${item.dueDate}`}>
                      <span className="row-icon tone-amber"><Icon name="recurring" size={20} /></span>
                      <div className="row-text"><p>{item.description}</p><span>{copy.due} {formatDay(item.dueDate, locale)}</span></div>
                      <span className="row-amount amount">{euros(-item.amountCents, locale)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </>
      )}
    </AppShell>
  );
}
