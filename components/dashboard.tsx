import Link from "next/link";
import type { CSSProperties } from "react";
import type { DashboardData } from "@/server/cash-flow/dashboard";
import type { Profile } from "@/server/profile/service";
import { formatEuros, localeTags, type Locale } from "@/server/locale";
import { AssetDonut } from "./asset-donut";
import { AmountVisibilityToggle, PrivateAmount } from "./amount-visibility";
import { AppShell } from "./app-shell";
import { dashboardCopy, type DashboardCopy } from "./dashboard-copy";
import { formatDay, formatMonth } from "./format";
import { categoryIcon } from "./category-icon";
import { Icon } from "./icon";
import { euros, signedText } from "@/components/euros";
import { CashFlowChart } from "./cash-flow-chart";

const palette = ["var(--brand)", "var(--chart-2)", "var(--warning)", "#a855f7", "#f43f5e"];

function CashFlow({ values, locale, copy }: { values: DashboardData["trend"]; locale: Locale; copy: DashboardCopy }) {
  const refundMonths = values.filter(({ expenseCents }) => expenseCents < 0);
  const points = values.map(({ month, incomeCents, expenseCents }) => ({ label: formatMonth(month, locale, "short"), incomeCents, expenseCents }));
  const summary = `${copy.cashFlowTrend}. ${points.map(
    ({ label, incomeCents, expenseCents }) => `${label}: ${copy.income} ${formatEuros(incomeCents, locale)}, ${copy.expenses} ${formatEuros(expenseCents, locale)}`,
  ).join("; ")}`;

  return (
    <section id="cash-flow" className="cash-flow card" aria-labelledby="cash-flow-title">
      <header className="card-head">
        <h2 id="cash-flow-title">{copy.cashFlow}</h2>
        <span className="period">{copy.sixMonths}</span>
      </header>
      <CashFlowChart points={points} locale={locale} labels={{ income: copy.income, expenses: copy.expenses }} summary={summary} />
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

const groupColors = { liquidity: "var(--chart-1)", savings: "var(--chart-5)", investments: "var(--chart-2)", pension: "var(--chart-4)", property: "var(--chart-3)" } as const;

function Worth({ data, locale, copy }: { data: DashboardData; locale: Locale; copy: DashboardCopy }) {
  const percent = new Intl.NumberFormat(localeTags[locale], { style: "percent", maximumFractionDigits: 1 });
  const { liquidityCents, savingsCents, investmentsCents, pensionCents, propertyCents } = data.assets;
  const groups = ([["liquidity", liquidityCents], ["savings", savingsCents], ["investments", investmentsCents], ["pension", pensionCents], ["property", propertyCents]] as const)
    .filter(([, cents]) => cents > 0);
  const total = groups.reduce((sum, [, cents]) => sum + cents, 0);
  const share = (cents: number) => percent.format(cents / total);
  const slices = groups.map(([key, cents]) => ({ label: copy.assetGroups[key], value: cents, color: groupColors[key] }));
  return (
    <section className="card dashboard-worth" aria-labelledby="worth-title">
      <header className="card-head">
        <h2 id="worth-title">{copy.netWorth}</h2>
        <div className="card-head-actions">
          <AmountVisibilityToggle locale={locale} />
          <Link className="text-link" href={`/${locale}/net-worth`}>{copy.details}</Link>
        </div>
      </header>
      {total > 0 && <AssetDonut slices={slices} netWorthCents={data.netWorthCents} centerLabel={copy.netWorth} locale={locale}
        summary={`${copy.assetShare}: ${slices.map(({ label, value }) => `${label} ${share(value)}`).join(", ")}`} />}
      <ul className="rows asset-legend">
        {groups.map(([key, cents]) => (
          <li className="data-row" key={key}>
            <span className="row-text"><i aria-hidden="true" style={{ background: groupColors[key] }} />{copy.assetGroups[key]} <span>· {share(cents)}</span></span>
            <span className="row-amount amount"><PrivateAmount>{euros(cents, locale)}</PrivateAmount></span>
          </li>
        ))}
        {data.liabilitiesCents > 0 && (
          <li className="data-row">
            <span className="row-text">{copy.debts}</span>
            <span className="row-amount amount"><PrivateAmount>{euros(-data.liabilitiesCents, locale)}</PrivateAmount></span>
          </li>
        )}
      </ul>
      {total === 0 && <p className="amount worth-total"><PrivateAmount>{euros(data.netWorthCents, locale)}</PrivateAmount></p>}
    </section>
  );
}

function Change({ rate, locale }: { rate: number | null; locale: Locale }) {
  if (rate === null) return <span className="muted">—</span>;
  const text = new Intl.NumberFormat(localeTags[locale], { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" }).format(rate);
  return <span className={`amount${rate > 0 ? " positive" : rate < 0 ? " negative" : ""}`}>{signedText(text)}</span>;
}

function Investments({ summary, benchmarks, locale, copy }: {
  summary: NonNullable<DashboardData["investments"]>; benchmarks: DashboardData["benchmarks"]; locale: Locale; copy: DashboardCopy;
}) {
  const points = new Intl.NumberFormat(localeTags[locale], { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const signedPoints = new Intl.NumberFormat(localeTags[locale], { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "exceptZero" });
  const ratio = (to: string, from: string | null) => from ? Number(to) / Number(from) - 1 : null;
  const { sp500, vix } = benchmarks ?? { sp500: null, vix: null };
  const dates = [...new Set([summary.lastClose?.asOf, sp500?.asOf, vix?.asOf].filter((date) => date !== undefined))].sort()
    .map((date) => formatDay(date, locale));
  return (
    <section className="card dashboard-narrow dashboard-investments" aria-labelledby="investments-title">
      <header className="card-head">
        <h2 id="investments-title">{copy.nav.investments}</h2>
        <div className="card-head-actions">
          <AmountVisibilityToggle locale={locale} />
          <Link className="text-link" href={`/${locale}/investments`}>{copy.details}</Link>
        </div>
      </header>
      <p className="investments-value amount"><PrivateAmount>{euros(summary.valueCents, locale)}</PrivateAmount></p>
      <p className="investments-gain">
        {copy.unrealised}{" "}
        <span className={`amount${summary.gainCents > 0 ? " positive" : summary.gainCents < 0 ? " negative" : ""}`}>
          <PrivateAmount>{euros(summary.gainCents, locale, { showPlus: true })}</PrivateAmount>
        </span>{" "}
        {summary.gainRate !== null && <>(<Change rate={summary.gainRate} locale={locale} />)</>}
      </p>
      <table className="market-table">
        <thead>
          <tr><td /><th scope="col">{copy.lastClose}</th><th scope="col">{copy.yearToDate}</th></tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">{copy.portfolio}</th>
            <td><Change rate={summary.lastClose?.rate ?? null} locale={locale} /></td>
            <td><Change rate={summary.ytd.rate} locale={locale} /></td>
          </tr>
          {sp500 && (
            <tr>
              <th scope="row">{copy.sp500}</th>
              <td><Change rate={ratio(sp500.close, sp500.previousClose)} locale={locale} /></td>
              <td><Change rate={ratio(sp500.close, sp500.yearStartClose)} locale={locale} /></td>
            </tr>
          )}
          {vix && (
            <tr>
              <th scope="row">{copy.vix}</th>
              <td className="amount">{points.format(Number(vix.close))} ({signedText(signedPoints.format(Number(vix.close) - Number(vix.previousClose)))})</td>
              <td><span className="muted">—</span></td>
            </tr>
          )}
        </tbody>
      </table>
      {dates.length > 0 && <p className="hint">{copy.closesOf(dates.join(" · "))}</p>}
    </section>
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
            {data.showNetWorth && <Worth data={data} locale={locale} copy={copy} />}
            {data.investments && <Investments summary={data.investments} benchmarks={data.benchmarks} locale={locale} copy={copy} />}

            <section className="card monthly dashboard-narrow" aria-labelledby="monthly-title">
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
                <li className="data-row monthly-net">
                  <span className="row-text">{copy.balance}</span>
                  <span className={`row-amount amount${data.monthlyNetCents > 0 ? " positive" : ""}`}>
                    {euros(data.monthlyNetCents, locale, { showPlus: true })}
                  </span>
                </li>
              </ul>
              {refundsExceed && <p className="hint refund-note">{copy.refundsExceed}</p>}
            </section>

            <CashFlow values={data.trend} locale={locale} copy={copy} />

            <section className="card budget dashboard-narrow" aria-labelledby="budget-title">
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
              <section className="card dashboard-narrow" aria-labelledby="due-title">
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
