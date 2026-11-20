"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent } from "react";
import type { AccountDto, CategoryDto } from "@/server/cash-flow/catalog";
import { FIRST_MONTH, LAST_MONTH } from "@/server/cash-flow/dates";
import type { MovementDto } from "@/server/cash-flow/movements";
import { formatEuros, type Locale } from "@/server/locale";
import { addMonths, formatDay, formatMonth } from "../format";
import { Icon } from "../icon";
import { Select, type SelectGroup } from "../select";
import { editableEuros, parseEuros } from "../money";
import { call } from "./api";
import { cashFlowCopy, type CashFlowCopy } from "./copy";
import { currentSuggestion, movementBody, type Suggestion } from "./movement-body";
import { NoticeLine, useAction } from "./use-action";

type Kind = "EXPENSE" | "INCOME" | "REFUND" | "TRANSFER";
type RegisterPage = { movements: MovementDto[]; hasMore: boolean };
type PageKey = "pageIn" | "pageOut" | "pageTransfers";

type Props = {
  locale: Locale;
  month: string;
  today: string;
  accounts: AccountDto[];
  categories: CategoryDto[];
  incoming: RegisterPage;
  outgoing: RegisterPage;
  transfers: RegisterPage;
  summary: { incomeCents: number; expenseCents: number; netCents: number };
  accountId?: string;
  categoryId?: string;
  pageIn: number;
  pageOut: number;
  pageTransfers: number;
};

const days = (locale: Locale) => (locale === "it" ? { today: "Oggi", yesterday: "Ieri" } : { today: "Today", yesterday: "Yesterday" });

function categoryGroups({ copy, categories, current, only }: {
  copy: CashFlowCopy; categories: CategoryDto[]; current?: string | null; only?: "EXPENSE";
}): SelectGroup[] {
  const usable = categories.filter((category) => (!category.archived || category.id === current) && (!only || category.kind === only));
  return [
    { label: "", options: [{ value: "", label: only ? "—" : copy.noCategory }] },
    ...(only ? ([only] as const) : (["EXPENSE", "INCOME"] as const)).map((kind) => ({
      label: copy.kinds[kind],
      options: usable.filter((category) => category.kind === kind).map((category) => ({
        value: category.id, label: `${category.name}${category.archived ? ` (${copy.archivedSuffix})` : ""}`,
      })),
    })),
  ];
}

function Segmented({ legend, value, options, onChange }: {
  legend: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void;
}) {
  const name = useId();
  return (
    <fieldset className="segmented">
      <legend className="visually-hidden">{legend}</legend>
      {options.map((option) => (
        <label key={option.value} className={value === option.value ? "is-selected" : undefined}>
          <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}

// ---- Create -------------------------------------------------------------------------------------

function NewMovement({ locale, today, accounts, categories }: Pick<Props, "locale" | "today" | "accounts" | "categories">) {
  const copy = cashFlowCopy[locale];
  const ids = useId();
  const { pending, notice, run, setNotice } = useAction(locale);
  const active = accounts.filter((account) => !account.archived);
  const [kind, setKind] = useState<Kind>("EXPENSE");
  const [accountId, setAccountId] = useState(active[0]?.id ?? "");
  const [chosenTo, setToAccountId] = useState(active[1]?.id ?? "");
  const [date, setDate] = useState(today);
  const [arrival, setArrival] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  // `manual` is null until the person picks a category ("" is the explicit "no category").
  const [manual, setManual] = useState<string | null>(null);
  // A suggestion remembers the description it answered; it is shown only while that still matches.
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [remember, setRemember] = useState("");

  useEffect(() => {
    if (kind === "TRANSFER" || !description.trim()) return;
    let current = true;
    const timer = setTimeout(async () => {
      const result = await call<{ categoryId: string | null }>("POST", "/rules/suggest", { description });
      if (current && result.ok) setSuggestion({ description, categoryId: result.data.categoryId });
    }, 300);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [description, kind]);

  // The destination can never equal the source: fall back to the first other account.
  const toAccountId = chosenTo !== accountId && active.some((account) => account.id === chosenTo)
    ? chosenTo
    : active.find((account) => account.id !== accountId)?.id ?? "";
  const refund = kind === "REFUND";
  const expenseIds = new Set(categories.filter((category) => category.kind === "EXPENSE" && !category.archived).map((category) => category.id));
  const fresh = kind === "TRANSFER" ? null : currentSuggestion(suggestion, description);
  // A refund must be filed under an expense category, so only such a suggestion is offered for it.
  const suggested = fresh && (!refund || expenseIds.has(fresh)) ? fresh : null;
  const touched = manual !== null;
  const categoryId = manual ?? suggested ?? "";

  function changeKind(next: Kind) {
    setKind(next);
    if (next === "REFUND" && manual && !expenseIds.has(manual)) setManual(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cents = parseEuros(amount);
    if (!cents) return setNotice({ kind: "error", text: `${copy.errors.validation} (${copy.fields.amountCents}). ${copy.amountHint}` });
    if (refund && !categoryId) return setNotice({ kind: "error", text: `${copy.errors.validation} (${copy.fields.categoryId}). ${copy.refundCategory}.` });

    const result = kind === "TRANSFER"
      ? await run(() => call("POST", "/transfers", {
        fromAccountId: accountId, toAccountId, amountCents: cents, bookingDate: date,
        ...(arrival ? { inBookingDate: arrival } : {}), description: description.trim() || copy.transferDefault,
      }), copy.transferCreated)
      : await run(() => call("POST", "/movements", movementBody({
        accountId, bookingDate: date, description,
        amountCents: kind === "EXPENSE" ? -cents : cents,
        // Automatic mode (nothing chosen) omits the category so the server's rules decide, even if the
        // suggestion lookup has not answered yet. A refund always names its expense category.
        manualCategory: refund ? categoryId : manual,
        rememberPhrase: categoryId ? remember : "",
      })), copy.created);

    if (result) {
      setAmount("");
      setDescription("");
      setRemember("");
      setArrival("");
      setManual(null);
      setSuggestion(null);
    }
  }

  if (active.length === 0) {
    return (
      <section id="new" className="card empty-card" aria-labelledby="new-title">
        <h2 id="new-title">{copy.noAccountsTitle}</h2>
        <p>{copy.noAccountsBody}</p>
        <Link className="primary-link" href={`/${locale}/accounts`}>{copy.goToAccounts}</Link>
      </section>
    );
  }

  const accountSelect = (id: string, value: string, onChange: (value: string) => void, label: string) => (
    <div className="form-field">
      <label htmlFor={`${ids}${id}`}>{label}</label>
      <Select id={`${ids}${id}`} value={value} onChange={onChange} options={active.map((account) => ({ value: account.id, label: account.name }))} />
    </div>
  );

  return (
    <section id="new" className="card" aria-labelledby="new-title">
      <h2 id="new-title">{copy.newMovement}</h2>
      <form className="movement-form" onSubmit={submit}>
        <Segmented
          legend={copy.newMovement}
          value={kind}
          onChange={(value) => changeKind(value as Kind)}
          options={[
            { value: "EXPENSE", label: copy.kindExpense },
            { value: "INCOME", label: copy.kindIncome },
            { value: "REFUND", label: copy.kindRefund },
            ...(active.length > 1 ? [{ value: "TRANSFER", label: copy.kindTransfer }] : []),
          ]}
        />
        {refund && <p className="hint refund-hint">{copy.refundHint}</p>}
        <div className="form-grid">
          {accountSelect("account", accountId, setAccountId, kind === "TRANSFER" ? copy.fromAccount : copy.account)}
          {kind === "TRANSFER" && accountSelect("to", toAccountId, setToAccountId, copy.toAccount)}
          <div className="form-field">
            <label htmlFor={`${ids}date`}>{kind === "TRANSFER" ? copy.departureDate : copy.date}</label>
            <input id={`${ids}date`} className="field" type="date" min="2000-01-01" max="2100-12-31" value={date} onChange={(event) => setDate(event.target.value)} required />
          </div>
          {kind === "TRANSFER" && (
            <div className="form-field">
              <label htmlFor={`${ids}arrival`}>{copy.arrivalDate}</label>
              <input id={`${ids}arrival`} className="field" type="date" min="2000-01-01" max="2100-12-31" value={arrival} onChange={(event) => setArrival(event.target.value)} aria-describedby={`${ids}arrival-hint`} />
              <span id={`${ids}arrival-hint`} className="hint">{copy.arrivalHint}</span>
            </div>
          )}
          <div className="form-field">
            <label htmlFor={`${ids}amount`}>{copy.amount} (€)</label>
            <input
              id={`${ids}amount`} className="field amount-field" inputMode="decimal" autoComplete="off" placeholder="0,00"
              value={amount} onChange={(event) => setAmount(event.target.value)} required aria-describedby={`${ids}amount-hint`}
            />
            <span id={`${ids}amount-hint`} className="hint">{copy.amountHint}</span>
          </div>
          <div className="form-field wide">
            <label htmlFor={`${ids}description`}>{copy.description}</label>
            <input
              id={`${ids}description`} className="field" maxLength={200} autoComplete="off"
              placeholder={kind === "TRANSFER" ? copy.transferDefault : undefined}
              value={description} onChange={(event) => setDescription(event.target.value)} required={kind !== "TRANSFER"}
            />
          </div>
          {kind !== "TRANSFER" && (
            <>
              <div className="form-field">
                <label htmlFor={`${ids}category`}>{refund ? copy.refundCategory : copy.category}</label>
                <Select
                  id={`${ids}category`} value={categoryId} onChange={setManual}
                  aria-describedby={!touched && suggested ? `${ids}suggested` : undefined}
                  groups={categoryGroups({ copy, categories, only: refund ? "EXPENSE" : undefined })}
                />
                {!touched && suggested && <span id={`${ids}suggested`} className="hint">{copy.suggestedCategory}</span>}
              </div>
              {categoryId && (
                <div className="form-field">
                  <label htmlFor={`${ids}remember`}>{copy.rememberLabel}</label>
                  <input
                    id={`${ids}remember`} className="field" maxLength={60} autoComplete="off" value={remember}
                    onChange={(event) => setRemember(event.target.value)} aria-describedby={`${ids}remember-hint`}
                  />
                  <span id={`${ids}remember-hint`} className="hint">{copy.rememberHint}</span>
                </div>
              )}
            </>
          )}
        </div>
        <div className="form-actions">
          <button className="primary-link" type="submit" disabled={pending}>
            {pending ? copy.saving : kind === "TRANSFER" ? copy.addTransfer : copy.addMovement}
          </button>
        </div>
        <NoticeLine notice={notice} />
      </form>
    </section>
  );
}

// ---- Rows ---------------------------------------------------------------------------------------

function EditForm({ locale, movement, accounts, categories, onDone }: {
  locale: Locale; movement: MovementDto; accounts: AccountDto[]; categories: CategoryDto[]; onDone: () => void;
}) {
  const copy = cashFlowCopy[locale];
  const ids = useId();
  const { pending, notice, run, setNotice } = useAction(locale);
  const paired = movement.transferId !== null;
  const linked = movement.linked !== null || movement.chargeLinked !== null;
  // Paired amounts and accounts are fixed; a linked movement stays an outflow in its account.
  const fixedAccount = paired || linked;
  const [kind, setKind] = useState<"EXPENSE" | "INCOME">(movement.amountCents < 0 ? "EXPENSE" : "INCOME");
  const [accountId, setAccountId] = useState(movement.accountId);
  const [date, setDate] = useState(movement.bookingDate);
  const [amount, setAmount] = useState(editableEuros(movement.amountCents, locale));
  const [description, setDescription] = useState(movement.description);
  const [categoryId, setCategoryId] = useState(movement.categoryId ?? "");
  const [remember, setRemember] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cents = parseEuros(amount);
    if (!cents) return setNotice({ kind: "error", text: `${copy.errors.validation} (${copy.fields.amountCents})` });
    const result = await run(() => call("PATCH", `/movements/${movement.id}`, {
      ...(fixedAccount ? {} : { accountId }),
      ...(paired ? {} : { amountCents: kind === "EXPENSE" ? -cents : cents }),
      bookingDate: date, description, categoryId: categoryId || null,
      ...(remember.trim() && categoryId ? { rememberPhrase: remember } : {}),
    }), copy.edited);
    if (result) onDone();
  }

  return (
    <form className="movement-form edit-form" onSubmit={submit}>
      {linked && <p className="hint">{movement.chargeLinked ? copy.chargeLinkedHint : copy.linkedHint}</p>}
      <div className="form-grid">
        {!paired && !linked && (
          <Segmented
            legend={copy.edit}
            value={kind}
            onChange={(value) => setKind(value as "EXPENSE" | "INCOME")}
            options={[{ value: "EXPENSE", label: copy.kindExpense }, { value: "INCOME", label: copy.kindIncome }]}
          />
        )}
        <div className="form-field">
          <label htmlFor={`${ids}account`}>{copy.account}</label>
          <Select id={`${ids}account`} value={accountId} disabled={fixedAccount} onChange={setAccountId}
            options={accounts.filter((account) => !account.archived || account.id === movement.accountId).map((account) => ({ value: account.id, label: account.name }))} />
        </div>
        <div className="form-field">
          <label htmlFor={`${ids}date`}>{copy.date}</label>
          <input id={`${ids}date`} className="field" type="date" min="2000-01-01" max="2100-12-31" value={date} onChange={(event) => setDate(event.target.value)} required />
        </div>
        <div className="form-field">
          <label htmlFor={`${ids}amount`}>{copy.amount} (€)</label>
          <input id={`${ids}amount`} className="field amount-field" inputMode="decimal" value={amount} disabled={paired} onChange={(event) => setAmount(event.target.value)} required />
        </div>
        <div className="form-field wide">
          <label htmlFor={`${ids}description`}>{copy.description}</label>
          <input id={`${ids}description`} className="field" maxLength={200} value={description} onChange={(event) => setDescription(event.target.value)} required />
        </div>
        <div className="form-field">
          <label htmlFor={`${ids}category`}>{copy.category}</label>
          <Select id={`${ids}category`} value={categoryId} onChange={setCategoryId}
            groups={categoryGroups({ copy, categories, current: movement.categoryId })} />
        </div>
        {categoryId && (
          <div className="form-field">
            <label htmlFor={`${ids}remember`}>{copy.rememberLabel}</label>
            <input id={`${ids}remember`} className="field" maxLength={60} value={remember} onChange={(event) => setRemember(event.target.value)} />
          </div>
        )}
      </div>
      <div className="form-actions">
        <button className="button button-solid" type="submit" disabled={pending}>{pending ? copy.saving : copy.save}</button>
        <button className="button button-quiet" type="button" onClick={onDone}>{copy.cancel}</button>
      </div>
      <NoticeLine notice={notice} />
    </form>
  );
}

type CandidatePage = { movements: MovementDto[]; hasMore: boolean; pageSize: number };

/** Counterparts for a transfer, nearest date first. A month and "show more" reach the whole history. */
function PairPanel({ locale, movement, accounts, today, onDone }: {
  locale: Locale; movement: MovementDto; accounts: AccountDto[]; today: string; onDone: () => void;
}) {
  const copy = cashFlowCopy[locale];
  const ids = useId();
  const { pending, notice, run } = useAction(locale);
  const [month, setMonth] = useState("");
  const [list, setList] = useState<MovementDto[] | null>(null);
  const [more, setMore] = useState(false);
  const [partner, setPartner] = useState("");
  const [loading, setLoading] = useState(false);
  const names = new Map(accounts.map((account) => [account.id, account.name]));
  const validMonth = month === "" || (/^\d{4}-\d{2}$/.test(month) && month >= FIRST_MONTH && month <= LAST_MONTH);

  async function load(append: boolean) {
    setLoading(true);
    const query = new URLSearchParams({ movementId: movement.id, offset: String(append ? list?.length ?? 0 : 0) });
    if (month) query.set("month", month);
    const result = await call<CandidatePage>("GET", `/transfers/candidates?${query}`);
    setLoading(false);
    if (!result.ok) return;
    const next = append ? [...(list ?? []), ...result.data.movements] : result.data.movements;
    setList(next);
    setMore(result.data.hasMore);
    if (!append) setPartner(next[0]?.id ?? "");
  }

  useEffect(() => {
    if (!validMonth) return;
    let current = true;
    const query = new URLSearchParams({ movementId: movement.id });
    if (month) query.set("month", month);
    call<CandidatePage>("GET", `/transfers/candidates?${query}`).then((result) => {
      if (!current) return;
      const next = result.ok ? result.data.movements : [];
      setList(next);
      setMore(result.ok && result.data.hasMore);
      setPartner(next[0]?.id ?? "");
    });
    return () => { current = false; };
  }, [movement.id, month, validMonth]);

  return (
    <div className="pair-panel">
      <h3>{copy.pairTitle}</h3>
      <div className="form-field">
        <label htmlFor={`${ids}month`}>{copy.matchMonth}</label>
        <input
          id={`${ids}month`} className="field" type="month" min={FIRST_MONTH} max={LAST_MONTH} placeholder="YYYY-MM"
          pattern="\d{4}-\d{2}" value={month} onChange={(event) => setMonth(event.target.value)} aria-describedby={`${ids}month-hint`} aria-invalid={!validMonth}
        />
        <span id={`${ids}month-hint`} className="hint">{copy.matchMonthHint}</span>
      </div>
      {list === null ? <p className="hint">…</p> : list.length === 0 ? <p className="hint">{copy.pairNone}</p> : (
        <div className="form-grid">
          <div className="form-field wide">
            <label htmlFor={`${ids}partner`}>{copy.pair}</label>
            <Select id={`${ids}partner`} value={partner} onChange={setPartner} options={list.map((candidate) => ({
              value: candidate.id,
              label: `${names.get(candidate.accountId)} · ${formatDay(candidate.bookingDate, locale, today, days(locale))} ${candidate.bookingDate.slice(0, 4)} · ${formatEuros(candidate.amountCents, locale, { showPlus: true })} · ${candidate.description}`,
            }))} />
          </div>
        </div>
      )}
      <div className="form-actions">
        {list && list.length > 0 && (
          <button
            className="button button-solid" type="button" disabled={pending || !partner}
            onClick={async () => {
              const result = await run(() => call("POST", "/transfers/pair", { movementIds: [movement.id, partner] }), copy.paired);
              if (result) onDone();
            }}
          >
            {copy.pairConfirm}
          </button>
        )}
        {more && <button className="button" type="button" disabled={loading} onClick={() => load(true)}>{copy.showMore}</button>}
        <button className="button button-quiet" type="button" onClick={onDone}>{copy.cancel}</button>
      </div>
      <NoticeLine notice={notice} />
    </div>
  );
}

function Row({ locale, movement, accounts, categories, today }: {
  locale: Locale; movement: MovementDto; accounts: AccountDto[]; categories: CategoryDto[]; today: string;
}) {
  const copy = cashFlowCopy[locale];
  const { pending, notice, run } = useAction(locale);
  const [mode, setMode] = useState<"view" | "edit" | "pair">("view");
  const account = accounts.find((item) => item.id === movement.accountId);
  const category = categories.find((item) => item.id === movement.categoryId);
  const paired = movement.transferId !== null;
  const linked = movement.linked;
  const chargeLinked = movement.chargeLinked;
  const refund = !paired && movement.amountCents > 0 && category?.kind === "EXPENSE";
  const tone = paired ? "blue" : movement.amountCents > 0 ? "green" : "red";
  const icon = paired ? "cashFlow" : movement.amountCents > 0 ? "arrowDown" : "arrowUp";
  const subtitle = [paired ? copy.transferBadge : category?.name ?? copy.noCategory, account?.name, formatDay(movement.bookingDate, locale, today, days(locale))]
    .filter(Boolean).join(" · ");

  return (
    <li className={`movement${movement.voided ? " is-voided" : ""}`}>
      <div className="data-row">
        <span className={`row-icon tone-${tone}`}><Icon name={icon} size={20} /></span>
        <div className="row-text">
          <p>
            {movement.description}
            {movement.voided && <span className="badge">{copy.voided}</span>}
            {paired && <span className="badge badge-blue">{copy.transferBadge}</span>}
            {refund && <span className="badge badge-green">{copy.refundBadge}</span>}
            {linked && <span className="badge badge-amber">{copy.recurringBadge}</span>}
            {chargeLinked && <span className="badge badge-amber">{copy.chargeBadge}</span>}
          </p>
          <span>{subtitle}</span>
        </div>
        <span className={`row-amount amount${movement.amountCents > 0 ? " positive" : ""}`}>
          {formatEuros(movement.amountCents, locale, { showPlus: true })}
        </span>
      </div>
      {mode === "view" && (
        <div className="row-actions">
          {!movement.voided && <button className="button button-quiet" type="button" onClick={() => setMode("edit")}>{copy.edit}</button>}
          {!paired && !movement.voided && !linked && !chargeLinked && <button className="button button-quiet" type="button" onClick={() => setMode("pair")}>{copy.pair}</button>}
          {paired && (
            <button
              className="button button-quiet" type="button" disabled={pending}
              onClick={() => run(() => call("DELETE", `/transfers/${movement.transferId}`), copy.unpaired)}
            >
              {copy.unpair}
            </button>
          )}
          {linked && (
            <button
              className="button button-quiet" type="button" disabled={pending}
              onClick={() => run(
                () => call<{ templateArchived: boolean }>("POST", "/recurring/occurrences", { action: "reopen", templateId: linked.templateId, dueDate: linked.dueDate }),
                (data: { templateArchived: boolean }) => ({ kind: "ok", text: data?.templateArchived ? copy.reopenedArchived : copy.reopened }),
              )}
            >
              {copy.reopen}
            </button>
          )}
          {chargeLinked && <Link className="button button-quiet" href={`/${locale}/property`}>{copy.openProperty}</Link>}
          {!paired && !linked && !chargeLinked && (
            <button
              className="button button-quiet" type="button" disabled={pending}
              onClick={() => run(() => call("PATCH", `/movements/${movement.id}`, { voided: !movement.voided }), movement.voided ? copy.restoredDone : copy.voidedDone)}
            >
              {movement.voided ? copy.unvoid : copy.void}
            </button>
          )}
        </div>
      )}
      {mode === "edit" && <EditForm locale={locale} movement={movement} accounts={accounts} categories={categories} onDone={() => setMode("view")} />}
      {mode === "pair" && <PairPanel locale={locale} movement={movement} accounts={accounts} today={today} onDone={() => setMode("view")} />}
      <NoticeLine notice={notice} />
    </li>
  );
}

// ---- Page ---------------------------------------------------------------------------------------

function Step({ href, label, symbol, disabledLabel }: { href: string | null; label: string; symbol: string; disabledLabel?: string }) {
  return href
    ? <Link className="icon-button" href={href} aria-label={label}><span aria-hidden="true">{symbol}</span></Link>
    : <span className="icon-button is-disabled" role="link" aria-disabled="true" aria-label={disabledLabel ? `${label} (${disabledLabel})` : label}><span aria-hidden="true">{symbol}</span></span>;
}

export function MovementsView(props: Props) {
  const { locale, month, today, accounts, categories, incoming, outgoing, transfers, summary, accountId, categoryId, pageIn, pageOut, pageTransfers } = props;
  const copy = cashFlowCopy[locale];
  const router = useRouter();
  const filtered = Boolean(accountId || categoryId);

  /** A pager preserves the other columns; changing month or filters resets all pages. */
  const link = (target: string, pages: Partial<Record<PageKey, number>> = {}) => {
    const query = new URLSearchParams({ month: target });
    if (accountId) query.set("accountId", accountId);
    if (categoryId) query.set("categoryId", categoryId);
    const next = { pageIn: 1, pageOut: 1, pageTransfers: 1, ...pages };
    for (const key of ["pageIn", "pageOut", "pageTransfers"] as const) {
      if (next[key] > 1) query.set(key, String(next[key]));
    }
    return `/${locale}/cash-flow?${query}`;
  };
  const pageLink = (key: PageKey, page: number) => link(month, { pageIn, pageOut, pageTransfers, [key]: page });
  const filter = (key: "accountId" | "categoryId", value: string) => {
    const query = new URLSearchParams({ month });
    const next = { accountId, categoryId, [key]: value || undefined };
    if (next.accountId) query.set("accountId", next.accountId);
    if (next.categoryId) query.set("categoryId", next.categoryId);
    router.push(`/${locale}/cash-flow?${query}`);
  };
  const stats = [
    { label: copy.income, cents: summary.incomeCents },
    { label: copy.expenses, cents: -summary.expenseCents },
    { label: copy.net, cents: summary.netCents },
  ];

  return (
    <div className="stack cash-flow-view">
      <NewMovement locale={locale} today={today} accounts={accounts} categories={categories} />

      <section className="card" aria-labelledby="register-title">
        <div className="card-head">
          <h2 id="register-title">{copy.movementList}</h2>
          <nav className="month-nav" aria-label={copy.month}>
            <Step href={month > FIRST_MONTH ? link(addMonths(month, -1)) : null} label={copy.previousMonth} symbol="‹" disabledLabel={copy.firstMonth} />
            <time className="month-nav-label" dateTime={month}>{formatMonth(month, locale)}</time>
            <Step href={month < LAST_MONTH ? link(addMonths(month, 1)) : null} label={copy.nextMonth} symbol="›" disabledLabel={copy.lastMonth} />
          </nav>
        </div>

        <dl className="stats" aria-label={copy.summary}>
          {stats.map((stat) => (
            <div key={stat.label}>
              <dt>{stat.label}</dt>
              <dd className={`amount${stat.cents > 0 ? " positive" : ""}`}>{formatEuros(stat.cents, locale, { showPlus: true })}</dd>
            </div>
          ))}
        </dl>
        <p className="hint">{copy.summaryNote}</p>
        {summary.expenseCents < 0 && <p className="hint">{copy.refundsExceed}</p>}

        <div className="filters" role="group" aria-label={copy.filters}>
          <div className="form-field">
            <label htmlFor="filter-account">{copy.account}</label>
            <Select id="filter-account" value={accountId ?? ""} onChange={(value) => filter("accountId", value)} options={[
              { value: "", label: copy.allAccounts },
              ...accounts.map((account) => ({ value: account.id, label: `${account.name}${account.archived ? ` (${copy.archivedSuffix})` : ""}` })),
            ]} />
          </div>
          <div className="form-field">
            <label htmlFor="filter-category">{copy.category}</label>
            <Select id="filter-category" value={categoryId ?? ""} onChange={(value) => filter("categoryId", value)} options={[
              { value: "", label: copy.allCategories }, { value: "none", label: copy.noCategory },
              ...categories.map((category) => ({ value: category.id, label: `${category.name}${category.archived ? ` (${copy.archivedSuffix})` : ""}` })),
            ]} />
          </div>
        </div>
      </section>
      <div className="flow-columns">
        {([
          { key: "pageIn", title: copy.income, empty: filtered ? copy.noIncomeMatches : pageIn > 1 ? copy.emptyPage : copy.noIncome, cents: summary.incomeCents, register: incoming, page: pageIn },
          { key: "pageOut", title: copy.expenses, empty: filtered ? copy.noExpensesMatches : pageOut > 1 ? copy.emptyPage : copy.noExpenses, cents: -summary.expenseCents, register: outgoing, page: pageOut },
        ] as const).map((column) => (
          <section key={column.key} className="card" aria-labelledby={`${column.key}-title`}>
            <h2 id={`${column.key}-title`}>{column.title}</h2>
            <p className={`flow-total amount${column.cents > 0 ? " positive" : ""}`}>
              {formatEuros(column.cents, locale, { showPlus: true })}
            </p>
            {column.register.movements.length === 0 ? (
              <div className="empty-inline">
                <p>{column.empty}</p>
                {column.page > 1 && <Link className="text-link" href={pageLink(column.key, 1)}>{copy.backToFirstPage}</Link>}
              </div>
            ) : (
              <ul className="rows movement-list">{column.register.movements.map((movement) => (
                <Row key={movement.id} locale={locale} movement={movement} accounts={accounts} categories={categories} today={today} />
              ))}</ul>
            )}
            <Pager copy={copy} title={column.title} page={column.page} hasMore={column.register.hasMore} href={(page) => pageLink(column.key, page)} />
          </section>
        ))}
      </div>
      {(transfers.movements.length > 0 || pageTransfers > 1) && (
        <section className="card" aria-labelledby="transfers-title">
          <h2 id="transfers-title">{copy.transfersTitle}</h2>
          {transfers.movements.length === 0 ? (
            <div className="empty-inline">
              <p>{copy.emptyPage}</p>
              {pageTransfers > 1 && <Link className="text-link" href={pageLink("pageTransfers", 1)}>{copy.backToFirstPage}</Link>}
            </div>
          ) : (
            <ul className="rows movement-list">{transfers.movements.map((movement) => (
              <Row key={movement.id} locale={locale} movement={movement} accounts={accounts} categories={categories} today={today} />
            ))}</ul>
          )}
          <Pager copy={copy} title={copy.transfersTitle} page={pageTransfers} hasMore={transfers.hasMore} href={(page) => pageLink("pageTransfers", page)} />
        </section>
      )}
    </div>
  );
}

function Pager({ copy, title, page, hasMore, href }: {
  copy: CashFlowCopy; title: string; page: number; hasMore: boolean; href: (page: number) => string;
}) {
  if (page === 1 && !hasMore) return null;
  return (
    <nav className="pagination" aria-label={`${title}: ${copy.pagination}`}>
      <Step href={page > 1 ? href(page - 1) : null} label={`${title}: ${copy.previousPage}`} symbol="‹" />
      <span className="pagination-label" aria-current="page">{copy.pageLabel(page)}</span>
      <Step href={hasMore ? href(page + 1) : null} label={`${title}: ${copy.nextPage}`} symbol="›" />
    </nav>
  );
}
