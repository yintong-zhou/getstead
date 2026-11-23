"use client";

import { DateField } from "../date-field";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { AccountDto, CategoryDto } from "@/server/cash-flow/catalog";
import { FIRST_MONTH, LAST_MONTH } from "@/server/cash-flow/dates";
import type { MovementDto } from "@/server/cash-flow/movements";
import { type Locale } from "@/server/locale";
import { addMonths, formatDay, formatMonth } from "../format";
import { categoryIcon } from "../category-icon";
import { Icon } from "../icon";
import { Select, type SelectGroup } from "../select";
import { amountInputProps } from "../amount-input";
import { editableEuros, parseEuros } from "../money";
import { call } from "./api";
import { cashFlowCopy, type CashFlowCopy } from "./copy";
import { currentSuggestion, movementBody, type Suggestion } from "./movement-body";
import { movementsCopy } from "./movements-copy";
import { historyHref } from "./movements-query";
import { MoreActions } from "./more-actions";
import { NoticeLine, useAction } from "./use-action";
import { euros } from "@/components/euros";
import "./movements.css";

type Kind = "EXPENSE" | "INCOME" | "REFUND" | "TRANSFER";

type Props = {
  locale: Locale;
  month: string;
  today: string;
  accounts: AccountDto[];
  categories: CategoryDto[];
  /** The most recent movements of the month, newest first (3 or 5). */
  incoming: MovementDto[];
  outgoing: MovementDto[];
  transfers: MovementDto[];
  summary: { incomeCents: number; expenseCents: number; netCents: number };
  show: 3 | 5;
};

export const days = (locale: Locale) => (locale === "it" ? { today: "Oggi", yesterday: "Ieri" } : { today: "Today", yesterday: "Yesterday" });

/** Sentinel option value: it opens the new-category popover instead of choosing a category. */
const NEW_CATEGORY = "__new__";

function categoryGroups({ copy, categories, current, only, newLabel }: {
  copy: CashFlowCopy; categories: CategoryDto[]; current?: string | null; only?: "EXPENSE"; newLabel?: string;
}): SelectGroup[] {
  const usable = categories.filter((category) => (!category.archived || category.id === current) && (!only || category.kind === only));
  return [
    { label: "", options: [...(newLabel ? [{ value: NEW_CATEGORY, label: newLabel, pinned: true }] : []), { value: "", label: only ? "—" : copy.noCategory }] },
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

function NewMovement({ locale, today, accounts, categories: loaded }: Pick<Props, "locale" | "today" | "accounts" | "categories">) {
  const copy = cashFlowCopy[locale];
  const extra = movementsCopy[locale];
  const ids = useId();
  const { pending, notice, run, setNotice } = useAction(locale);
  // The popover has its own pending state and notice, so creating a category never touches the draft's.
  const creator = useAction(locale);
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
  // Categories created here are usable at once, before the refreshed server data arrives.
  const [added, setAdded] = useState<CategoryDto[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<"EXPENSE" | "INCOME" | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const categoryPopover = useRef<HTMLDivElement>(null);
  const setCreateNotice = creator.setNotice;
  const categories = [...loaded, ...added.filter((category) => !loaded.some((item) => item.id === category.id))];

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

  useEffect(() => {
    if (creating) nameInput.current?.focus();
  }, [creating]);

  useEffect(() => {
    if (!creating || creator.pending) return;
    function dismissOutside(event: PointerEvent) {
      if (!(event.target instanceof Element) || categoryPopover.current?.contains(event.target)
        || document.getElementById(`${ids}category`)?.contains(event.target) || event.target.closest(".select-popup")) return;
      setCreating(false);
      setNewName("");
      setNewKind(null);
      setCreateNotice(null);
    }
    document.addEventListener("pointerdown", dismissOutside);
    return () => document.removeEventListener("pointerdown", dismissOutside);
  }, [creating, creator.pending, ids, setCreateNotice]);

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
  // The new category defaults to the movement's kind; a refund can only be filed under an expense category.
  const createKind = refund ? "EXPENSE" : newKind ?? (kind === "INCOME" ? "INCOME" : "EXPENSE");

  function changeKind(next: Kind) {
    setKind(next);
    if (next === "REFUND" && manual && !expenseIds.has(manual)) setManual(null);
    if (next === "TRANSFER") setCreating(false);
  }

  function closePopover(keepNotice = false) {
    if (creator.pending) return;
    setCreating(false);
    setNewName("");
    setNewKind(null);
    if (!keepNotice) setCreateNotice(null);
    document.getElementById(`${ids}category`)?.focus();
  }

  async function createCategory() {
    const name = newName.trim();
    if (!name) return creator.setNotice({ kind: "error", text: `${copy.errors.validation} (${copy.fields.name})` });
    const result = await creator.run(() => call<CategoryDto>("POST", "/categories", { name, kind: createKind }), extra.newCategoryCreated);
    if (!result) return;
    setAdded((list) => [...list, result.data]);
    setManual(result.data.id);
    closePopover(true);
  }

  function popoverKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      closePopover();
    } else if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
      // This panel sits inside the movement form: Enter creates the category and never submits the movement.
      event.preventDefault();
      void createCategory();
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;
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
            <DateField locale={locale} id={`${ids}date`} type="date" min="2000-01-01" max="2100-12-31" value={date} onValueChange={setDate} required />
          </div>
          {kind === "TRANSFER" && (
            <div className="form-field">
              <label htmlFor={`${ids}arrival`}>{copy.arrivalDate}</label>
              <DateField locale={locale} id={`${ids}arrival`} type="date" min="2000-01-01" max="2100-12-31" value={arrival} onValueChange={setArrival} aria-describedby={`${ids}arrival-hint`} />
              <span id={`${ids}arrival-hint`} className="hint">{copy.arrivalHint}</span>
            </div>
          )}
          <div className="form-field">
            <label htmlFor={`${ids}amount`}>{copy.amount} (€)</label>
            <input
              id={`${ids}amount`} className="field amount-field" {...amountInputProps(locale, parseEuros, setAmount)} autoComplete="off" placeholder="0,00"
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
            // One row of its own, so the optional phrase field lines up with the category beside it.
            <div className="category-row">
              <div className="form-field">
                <label htmlFor={`${ids}category`}>{refund ? copy.refundCategory : copy.category}</label>
                <Select
                  id={`${ids}category`} value={categoryId}
                  onChange={(value) => {
                    if (value !== NEW_CATEGORY) {
                      setManual(value);
                      if (creating) closePopover();
                    } else if (creating) {
                      requestAnimationFrame(() => nameInput.current?.focus());
                    } else {
                      setCreateNotice(null);
                      setCreating(true);
                    }
                  }}
                  aria-describedby={!touched && suggested ? `${ids}suggested` : undefined}
                  groups={categoryGroups({ copy, categories, only: refund ? "EXPENSE" : undefined, newLabel: extra.newCategoryOption })}
                />
                {!touched && suggested && <span id={`${ids}suggested`} className="hint">{copy.suggestedCategory}</span>}
              </div>
              {categoryId && (
                <div className="form-field">
                  <label htmlFor={`${ids}remember`}>{extra.rememberLabel}</label>
                  <input
                    id={`${ids}remember`} className="field" maxLength={60} autoComplete="off" value={remember}
                    onChange={(event) => setRemember(event.target.value)} aria-describedby={`${ids}remember-hint`}
                  />
                  <span id={`${ids}remember-hint`} className="hint">{copy.rememberHint}</span>
                </div>
              )}
              {creating && (
                <div ref={categoryPopover} role="dialog" aria-labelledby={`${ids}new-category-title`} className="category-popover" onKeyDown={popoverKeys}>
                  <h3 id={`${ids}new-category-title`}>{extra.newCategoryTitle}</h3>
                  <div className="form-field">
                    <label htmlFor={`${ids}new-category-name`}>{extra.newCategoryName}</label>
                    <input
                      id={`${ids}new-category-name`} ref={nameInput} className="field" maxLength={80} autoComplete="off"
                      value={newName} onChange={(event) => setNewName(event.target.value)}
                    />
                  </div>
                  {refund ? (
                    <p className="hint">{extra.newCategoryType}: {copy.kinds.EXPENSE}</p>
                  ) : (
                    <Segmented
                      legend={extra.newCategoryType}
                      value={createKind}
                      onChange={(value) => setNewKind(value as "EXPENSE" | "INCOME")}
                      options={[{ value: "EXPENSE", label: copy.kinds.EXPENSE }, { value: "INCOME", label: copy.kinds.INCOME }]}
                    />
                  )}
                  <div className="form-actions">
                    <button className="button button-solid" type="button" disabled={creator.pending} onClick={() => void createCategory()}>
                      {creator.pending ? copy.saving : extra.newCategoryCreate}
                    </button>
                    <button className="button button-quiet" type="button" disabled={creator.pending} onClick={() => closePopover()}>{copy.cancel}</button>
                  </div>
                </div>
              )}
              <NoticeLine notice={creator.notice} />
            </div>
          )}
        </div>
        <div className="form-actions">
          <button className="primary-link" type="submit" disabled={pending || creating}>
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
  const extra = movementsCopy[locale];
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
          <DateField locale={locale} id={`${ids}date`} type="date" min="2000-01-01" max="2100-12-31" value={date} onValueChange={setDate} required />
        </div>
        <div className="form-field">
          <label htmlFor={`${ids}amount`}>{copy.amount} (€)</label>
          <input id={`${ids}amount`} className="field amount-field" {...amountInputProps(locale, parseEuros, setAmount)} value={amount} disabled={paired} onChange={(event) => setAmount(event.target.value)} required />
        </div>
        <div className="form-field wide">
          <label htmlFor={`${ids}description`}>{copy.description}</label>
          <input id={`${ids}description`} className="field" maxLength={200} value={description} onChange={(event) => setDescription(event.target.value)} required />
        </div>
        <div className="category-row">
          <div className="form-field">
            <label htmlFor={`${ids}category`}>{copy.category}</label>
            <Select id={`${ids}category`} value={categoryId} onChange={setCategoryId}
              groups={categoryGroups({ copy, categories: linked ? categories.filter((item) => item.kind === "EXPENSE" || item.id === movement.categoryId) : categories, current: movement.categoryId })} />
          </div>
          {categoryId && (
            <div className="form-field">
              <label htmlFor={`${ids}remember`}>{extra.rememberLabel}</label>
              <input id={`${ids}remember`} className="field" maxLength={60} value={remember} onChange={(event) => setRemember(event.target.value)} />
            </div>
          )}
        </div>
      </div>
      <div className="form-actions">
        <button className="button button-solid" type="submit" disabled={pending}>{pending ? copy.saving : copy.save}</button>
        <button className="button button-quiet" type="button" onClick={onDone}>{copy.cancel}</button>
      </div>
      <NoticeLine notice={notice} />
    </form>
  );
}

/** One compact row shared by previews and history. */
export function Row({ locale, movement, accounts, categories, today }: {
  locale: Locale; movement: MovementDto; accounts: AccountDto[]; categories: CategoryDto[]; today: string;
}) {
  const copy = cashFlowCopy[locale];
  const extra = movementsCopy[locale];
  const { pending, notice, run } = useAction(locale);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const actionTrigger = useRef<HTMLElement>(null);
  const account = accounts.find((item) => item.id === movement.accountId);
  const category = categories.find((item) => item.id === movement.categoryId);
  const paired = movement.transferId !== null;
  const linked = movement.linked;
  const chargeLinked = movement.chargeLinked;
  const refund = !paired && movement.amountCents > 0 && category?.kind === "EXPENSE";
  const tone = paired ? "blue" : movement.amountCents > 0 ? "green" : "red";
  // The category sets the icon; the colour still says whether money came in or went out.
  const icon = paired ? "cashFlow" : category ? categoryIcon(category.name, category.kind) : movement.amountCents > 0 ? "arrowDown" : "arrowUp";
  const subtitle = [paired ? null : category?.name ?? copy.noCategory, account?.name, formatDay(movement.bookingDate, locale, today, days(locale))]
    .filter(Boolean).join(" · ");

  return (
    <li className={`movement${movement.voided ? " is-voided" : ""}`}>
      <div className="data-row">
        <span className={`row-icon tone-${tone}`}><Icon name={icon} size={20} /></span>
        <div className="row-text">
          <p className="movement-description">{movement.description}</p>
          <div className="movement-meta">
            <span>{subtitle}</span>
            {movement.voided && <span className="badge">{copy.voided}</span>}
            {paired && <span className="badge badge-blue">{copy.transferBadge}</span>}
            {refund && <span className="badge badge-green">{copy.refundBadge}</span>}
            {linked && <span className="badge badge-amber">{copy.recurringBadge}</span>}
            {chargeLinked && <span className="badge badge-amber">{copy.chargeBadge}</span>}
          </div>
        </div>
        <span className={`row-amount amount${movement.amountCents > 0 ? " positive" : ""}`}>
          {euros(movement.amountCents, locale, { showPlus: true })}
        </span>
        {mode === "view" && (
          <MoreActions label={extra.moreActionsFor(movement.description)} title={extra.moreActions} triggerRef={actionTrigger}>
              {!movement.voided && <button className="button button-quiet" type="button" onClick={() => setMode("edit")}>{copy.edit}</button>}
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
              {chargeLinked && (
                <button
                  className="button button-quiet" type="button" disabled={pending}
                  onClick={() => run(() => call("PATCH", `/charges/${chargeLinked.chargeId}`, { action: "reopen" }, "/api/property"), copy.reopenedCharge)}
                >
                  {copy.reopenCharge}
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
          </MoreActions>
        )}
      </div>
      {mode === "edit" && <EditForm locale={locale} movement={movement} accounts={accounts} categories={categories} onDone={() => {
        setMode("view");
        requestAnimationFrame(() => actionTrigger.current?.focus());
      }} />}
      <NoticeLine notice={notice} />
    </li>
  );
}

// ---- Page ---------------------------------------------------------------------------------------

export function Step({ href, label, direction, disabledLabel }: { href: string | null; label: string; direction: "previous" | "next"; disabledLabel?: string }) {
  const icon = <Icon name={direction === "previous" ? "chevronLeft" : "chevronRight"} size={20} />;
  return href
    ? <Link className="icon-button" href={href} aria-label={label}>{icon}</Link>
    : <span className="icon-button is-disabled" role="link" aria-disabled="true" aria-label={disabledLabel ? `${label} (${disabledLabel})` : label}>{icon}</span>;
}

export function Pager({ copy, title, page, hasMore, href }: {
  copy: CashFlowCopy; title: string; page: number; hasMore: boolean; href: (page: number) => string;
}) {
  if (page === 1 && !hasMore) return null;
  return (
    <nav className="pagination" aria-label={`${title}: ${copy.pagination}`}>
      <Step href={page > 1 ? href(page - 1) : null} label={`${title}: ${copy.previousPage}`} direction="previous" />
      <span className="pagination-label" aria-current="page">{copy.pageLabel(page)}</span>
      <Step href={hasMore ? href(page + 1) : null} label={`${title}: ${copy.nextPage}`} direction="next" />
    </nav>
  );
}

export function MovementsView(props: Props) {
  const { locale, month, today, accounts, categories, incoming, outgoing, transfers, summary, show } = props;
  const copy = cashFlowCopy[locale];
  const extra = movementsCopy[locale];

  /** The preview length is part of the URL, so it is kept when the month changes. */
  const link = (target: string, rows = show) => `/${locale}/cash-flow?month=${target}${rows === 5 ? "&show=5" : ""}`;
  const stats = [
    { label: copy.income, cents: summary.incomeCents },
    { label: copy.expenses, cents: -summary.expenseCents },
    { label: copy.net, cents: summary.netCents },
  ];
  const previews = [
    { key: "in", title: extra.recentIncome, empty: copy.noIncome, cents: summary.incomeCents, rows: incoming },
    { key: "out", title: extra.recentExpenses, empty: copy.noExpenses, cents: -summary.expenseCents, rows: outgoing },
  ] as const;

  const list = (rows: MovementDto[]) => (
    <ul className="rows movement-list">{rows.map((movement) => (
      <Row key={movement.id} locale={locale} movement={movement} accounts={accounts} categories={categories} today={today} />
    ))}</ul>
  );

  return (
    <div className="stack cash-flow-view">
      <NewMovement locale={locale} today={today} accounts={accounts} categories={categories} />

      <section className="card" aria-labelledby="register-title">
        <div className="card-head">
          <h2 id="register-title">{copy.movementList}</h2>
          <nav className="month-nav" aria-label={copy.month}>
            <Step href={month > FIRST_MONTH ? link(addMonths(month, -1)) : null} label={copy.previousMonth} direction="previous" disabledLabel={copy.firstMonth} />
            <time className="month-nav-label" dateTime={month}>{formatMonth(month, locale)}</time>
            <Step href={month < LAST_MONTH ? link(addMonths(month, 1)) : null} label={copy.nextMonth} direction="next" disabledLabel={copy.lastMonth} />
          </nav>
        </div>

        <dl className="stats" aria-label={copy.summary}>
          {stats.map((stat) => (
            <div key={stat.label}>
              <dt>{stat.label}</dt>
              <dd className={`amount${stat.cents > 0 ? " positive" : ""}`}>{euros(stat.cents, locale, { showPlus: true })}</dd>
            </div>
          ))}
        </dl>
        <p className="hint">{copy.summaryNote}</p>
        {summary.expenseCents < 0 && <p className="hint">{copy.refundsExceed}</p>}

        <div className="preview-controls">
          <Link className="text-link" href={link(month, show === 5 ? 3 : 5)}>{show === 5 ? extra.previewThree : extra.previewFive}</Link>
          <Link className="text-link" href={historyHref(locale, { month })}>{extra.historyTitle}</Link>
        </div>
      </section>

      <div className="flow-columns">
        {previews.map((column) => (
          <section key={column.key} className="card" aria-labelledby={`preview-${column.key}-title`}>
            <div className="card-head">
              <h2 id={`preview-${column.key}-title`}>{column.title}</h2>
              <Link className="text-link" href={historyHref(locale, { month, type: column.key })} aria-label={extra.viewAllFor(column.title)}>{extra.viewAll}</Link>
            </div>
            <p className={`flow-total amount${column.cents > 0 ? " positive" : ""}`}>
              {euros(column.cents, locale, { showPlus: true })}
            </p>
            {column.rows.length === 0 ? <div className="empty-inline"><p>{column.empty}</p></div> : list(column.rows)}
          </section>
        ))}
      </div>

      {transfers.length > 0 && (
        <section className="card" aria-labelledby="preview-transfers-title">
          <div className="card-head">
            <h2 id="preview-transfers-title">{extra.recentTransfers}</h2>
            <Link className="text-link" href={historyHref(locale, { month, type: "transfers" })} aria-label={extra.viewAllFor(extra.recentTransfers)}>{extra.viewAll}</Link>
          </div>
          {list(transfers)}
        </section>
      )}
    </div>
  );
}
