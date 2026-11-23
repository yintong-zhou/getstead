"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { AccountDto, AccountTypeDto, CategoryDto } from "@/server/cash-flow/catalog";
import { logoGroupsByType } from "@/server/cash-flow/logo-catalog";
import type { RuleDto } from "@/server/cash-flow/rules";
import type { Locale } from "@/server/locale";
import { categoryIcon } from "../category-icon";
import { Icon } from "../icon";
import { amountInputProps } from "../amount-input";
import { parseLimit } from "../money";
import { Select, type SelectGroup } from "../select";
import { AccountLogoControls, accountLogoLabel, accountLogoPath } from "./account-logo";
import { call } from "./api";
import { cashFlowCopy } from "./copy";
import { MoreActions } from "./more-actions";
import { useConfirm } from "../confirm-dialog";
import { NoticeLine, useAction } from "./use-action";

const accountTypes = ["CHECKING", "CARD", "CASH", "BROKERAGE", "CRYPTO", "PENSION", "DEBT"] as const;
type BaseType = AccountDto["type"];

type Props = { locale: Locale; accounts: AccountDto[]; accountTypes: AccountTypeDto[]; categories: CategoryDto[]; rules: RuleDto[] };

// A type choice is a built-in type ("CHECKING") or one of the user's types ("custom:<id>"); the server derives the base kind.
const CUSTOM = "custom:";
const typeValue = (account: Pick<AccountDto, "type" | "customTypeId">) => account.customTypeId ? CUSTOM + account.customTypeId : account.type;
const typeBody = (value: string) => value.startsWith(CUSTOM) ? { customTypeId: value.slice(CUSTOM.length) } : { type: value };
const baseOf = (value: string, types: AccountTypeDto[]) =>
  value.startsWith(CUSTOM) ? types.find((type) => CUSTOM + type.id === value)?.baseType : value as BaseType;

/** Built-in types keep their localized label; a custom type shows the user's own name. */
function accountTypeLabel(locale: Locale, account: Pick<AccountDto, "type" | "customTypeId">, types: AccountTypeDto[]) {
  const custom = account.customTypeId ? types.find((type) => type.id === account.customTypeId) : undefined;
  return custom?.name ?? cashFlowCopy[locale].accountTypes[account.type];
}

/** Archived custom types stay out of the choices, except the one an account already carries. */
function typeGroups(locale: Locale, types: AccountTypeDto[], currentId?: string | null): SelectGroup[] {
  const copy = cashFlowCopy[locale];
  const custom = types.filter((type) => !type.archived || type.id === currentId);
  const builtIn = { label: copy.builtInTypes, options: accountTypes.map((type) => ({ value: type, label: copy.accountTypes[type] })) };
  return custom.length ? [builtIn, { label: copy.customTypes, options: custom.map((type) => ({ value: CUSTOM + type.id, label: type.name })) }] : [builtIn];
}

function formData(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  return new FormData(event.currentTarget);
}

function Row({ locale, name, meta, archived, logo, menuItems, confirmDelete, metaTone, onRename, onArchive, onDelete }: {
  locale: Locale; name: string; meta: string; archived: boolean; confirmDelete: string; metaTone?: "positive" | "negative";
  logo?: ReactNode; menuItems?: ReactNode;
  onRename: (name: string) => void; onArchive: () => void; onDelete?: () => void;
}) {
  const copy = cashFlowCopy[locale];
  const [editing, setEditing] = useState(false);
  const inputId = useId();
  const { confirm, dialog } = useConfirm(copy.cancel);
  const trigger = useRef<HTMLElement>(null);
  const stopEditing = () => {
    setEditing(false);
    requestAnimationFrame(() => trigger.current?.focus());
  };

  return (
    <li className={`manage-row${archived ? " is-archived" : ""}`}>
      {editing ? (
        <form
          className="inline-form"
          onSubmit={(event) => {
            const value = String(formData(event).get("name") ?? "").trim();
            if (value) onRename(value);
            stopEditing();
          }}
        >
          <label className="visually-hidden" htmlFor={inputId}>{copy.name}</label>
          <input id={inputId} name="name" className="field" defaultValue={name} maxLength={80} required autoFocus />
          <button className="button" type="submit">{copy.save}</button>
          <button className="button button-quiet" type="button" onClick={stopEditing}>{copy.cancel}</button>
        </form>
      ) : (
        <>
          <div className="row-text">
            <p>{name}</p>
            <span>{metaTone ? <strong className={`meta-${metaTone}`}>{meta}</strong> : meta}{archived ? ` · ${copy.archivedSuffix}` : ""}</span>
          </div>
          <MoreActions label={copy.moreActionsFor(name)} title={copy.actions} triggerRef={trigger}>
            <button className="button button-quiet" type="button" onClick={() => setEditing(true)}>{copy.edit}</button>
            {menuItems}
            <button className="button button-quiet" type="button" onClick={onArchive}>{archived ? copy.restore : copy.archive}</button>
            {onDelete && <button className="button button-quiet" type="button" onClick={async () => { if (await confirm(confirmDelete, copy.delete, true)) onDelete(); }}>{copy.delete}</button>}
          </MoreActions>
        </>
      )}
      {logo}
      {dialog}
    </li>
  );
}

/** Changes an account's type in place; its movements, balance checks and logo stay as they are. */
function TypeForm({ locale, account, types, action, onDone }: {
  locale: Locale; account: AccountDto; types: AccountTypeDto[]; action: ReturnType<typeof useAction>; onDone: () => void;
}) {
  const copy = cashFlowCopy[locale];
  const [value, setValue] = useState(typeValue(account));
  const id = useId();
  return (
    <form
      className="inline-form"
      aria-label={`${copy.changeType}: ${account.name}`}
      onSubmit={async (event) => {
        event.preventDefault();
        if (value === typeValue(account)) return onDone();
        if (await action.run(() => call("PATCH", `/accounts/${account.id}`, typeBody(value)), copy.typeChanged)) onDone();
      }}
    >
      <label className="visually-hidden" htmlFor={id}>{copy.accountType}</label>
      <Select id={id} value={value} onChange={setValue} groups={typeGroups(locale, types, account.customTypeId)} />
      <button className="button" type="submit" disabled={action.pending}>{copy.save}</button>
      <button className="button button-quiet" type="button" onClick={onDone}>{copy.cancel}</button>
    </form>
  );
}

function AccountRow({ locale, account, types, lookup, action }: {
  locale: Locale; account: AccountDto; types: AccountTypeDto[]; lookup?: "pending" | "failed"; action: ReturnType<typeof useAction>;
}) {
  const copy = cashFlowCopy[locale];
  const [logoOpen, setLogoOpen] = useState<boolean>();
  const [typeOpen, setTypeOpen] = useState(false);
  const showLogo = logoOpen ?? lookup === "failed";
  const path = `/accounts/${account.id}`;

  return (
    <Row
      locale={locale} name={account.name} archived={account.archived} meta={accountTypeLabel(locale, account, types)}
      confirmDelete={copy.confirmDeleteAccount(account.name)}
      logo={<>
        {typeOpen && <TypeForm locale={locale} account={account} types={types} action={action} onDone={() => setTypeOpen(false)} />}
        <AccountLogoControls account={account} locale={locale} lookup={lookup} open={showLogo} onDone={() => setLogoOpen(false)} />
      </>}
      menuItems={(<>
        <button className="button button-quiet" type="button" aria-expanded={typeOpen} onClick={() => setTypeOpen(!typeOpen)}>
          {copy.changeType}
        </button>
        <button className="button button-quiet" type="button" aria-expanded={showLogo} onClick={() => setLogoOpen(!showLogo)}>
          {accountLogoLabel(locale)}
        </button>
      </>)}
      onRename={(name) => action.run(() => call("PATCH", path, { name }), copy.saved)}
      onArchive={() => action.run(() => call("PATCH", path, { archived: !account.archived }), copy.saved)}
      onDelete={() => void action.run(() => call("DELETE", path), copy.removed)}
    />
  );
}

export function AccountsView({ locale, accounts, accountTypes: types, categories, rules }: Props) {
  const copy = cashFlowCopy[locale];
  const router = useRouter();
  const accountsAction = useAction(locale);
  const typesAction = useAction(locale);
  const categoriesAction = useAction(locale);
  const rulesAction = useAction(locale);
  const [showArchived, setShowArchived] = useState(false);
  const [lookups, setLookups] = useState(() => new Map<string, "pending" | "failed">());
  const categoryName = new Map(categories.map((category) => [category.id, category.name]));
  const visibleAccounts = accounts.filter((account) => showArchived || !account.archived);
  const visibleCategories = categories.filter((category) => showArchived || !category.archived);
  const visibleTypes = types.filter((type) => showArchived || !type.archived);
  const hasArchived = accounts.some((account) => account.archived) || categories.some((category) => category.archived)
    || types.some((type) => type.archived);
  const activeCategories = categories.filter((category) => !category.archived);

  return (
    <div className="stack">
      <section className="card" aria-labelledby="accounts-title">
        <header className="card-head">
          <h2 id="accounts-title">{copy.accountsSection}</h2>
          {hasArchived && (
            <button
              className="button archived-filter"
              type="button"
              role="switch"
              aria-checked={showArchived}
              onClick={() => setShowArchived((visible) => !visible)}
            >
              {copy.showArchived}
              <span className="archived-filter-track" aria-hidden="true" />
            </button>
          )}
        </header>
        {visibleAccounts.length === 0 ? <p className="empty-inline">{copy.accountsEmpty}</p> : (
          <ul className="rows">
            {visibleAccounts.map((account) => (
              <AccountRow key={account.id} locale={locale} account={account} types={types} lookup={lookups.get(account.id)} action={accountsAction} />
            ))}
          </ul>
        )}
        <form
          className="form-grid"
          aria-label={copy.newAccount}
          onSubmit={async (event) => {
            const form = event.currentTarget;
            const data = formData(event);
            const typeChoice = String(data.get("type"));
            const accountType = baseOf(typeChoice, types);
            const balanceText = String(data.get("balance") ?? "").trim();
            const cents = balanceText ? parseLimit(balanceText) : undefined;
            if (cents === null) {
              accountsAction.setNotice({ kind: "error", text: copy.openingBalanceError });
              return;
            }
            // Cards and debts hold what you owe: the amount typed is stored as negative.
            const openingBalanceCents = cents === undefined ? undefined : accountType === "CARD" || accountType === "DEBT" ? -cents : cents;
            const result = await accountsAction.run(
              () => call<AccountDto>("POST", "/accounts", { name: String(data.get("name") ?? ""), ...typeBody(typeChoice), ...(cents === undefined ? {} : { openingBalanceCents }) }),
              copy.accountAdded,
            );
            if (!result) return;
            form.reset();
            const { id, type } = result.data;
            if (!logoGroupsByType[type]?.length) return; // cash has no catalog to match against
            setLookups((current) => new Map(current).set(id, "pending"));
            const logo = await call("POST", accountLogoPath(id), { lookup: true });
            setLookups((current) => {
              const next = new Map(current);
              if (logo.ok) next.delete(id);
              else next.set(id, "failed");
              return next;
            });
            if (logo.ok) router.refresh();
          }}
        >
          <div className="form-field">
            <label htmlFor="account-name">{copy.name}</label>
            <input id="account-name" name="name" className="field" maxLength={80} required />
          </div>
          <div className="form-field">
            <label htmlFor="account-type">{copy.accountType}</label>
            <Select id="account-type" name="type" defaultValue="CHECKING" groups={typeGroups(locale, types)} />
          </div>
          <div className="form-field">
            <label htmlFor="account-balance">{copy.openingBalance}</label>
            <input id="account-balance" name="balance" className="field amount-field" {...amountInputProps(locale, parseLimit)} aria-describedby="account-balance-hint" />
            <p className="hint" id="account-balance-hint">{copy.openingBalanceHint}</p>
          </div>
          <button className="button form-submit" type="submit" disabled={accountsAction.pending}>{copy.addAccount}</button>
        </form>
        <NoticeLine notice={accountsAction.notice} />
      </section>

      <section className="card" aria-labelledby="account-types-title">
        <h2 id="account-types-title">{copy.accountTypesSection}</h2>
        <p className="hint">{copy.accountTypesIntro}</p>
        {visibleTypes.length === 0 ? <p className="empty-inline">{copy.accountTypesEmpty}</p> : (
          <ul className="rows">
            {visibleTypes.map((type) => (
              <Row
                key={type.id} locale={locale} name={type.name} archived={type.archived}
                meta={copy.worksLike(copy.accountTypes[type.baseType])}
                onRename={(name) => typesAction.run(() => call("PATCH", `/account-types/${type.id}`, { name }), copy.saved)}
                onArchive={() => typesAction.run(() => call("PATCH", `/account-types/${type.id}`, { archived: !type.archived }), copy.saved)}
                confirmDelete={copy.confirmDeleteAccountType(type.name)}
                onDelete={() => void typesAction.run(() => call("DELETE", `/account-types/${type.id}`), copy.removed)}
              />
            ))}
          </ul>
        )}
        <form
          className="form-grid"
          aria-label={copy.newAccountType}
          onSubmit={async (event) => {
            const form = event.currentTarget;
            const data = formData(event);
            const result = await typesAction.run(
              () => call("POST", "/account-types", { name: String(data.get("name") ?? ""), baseType: String(data.get("baseType")) }),
              copy.accountTypeAdded,
            );
            if (result) form.reset();
          }}
        >
          <div className="form-field">
            <label htmlFor="account-type-name">{copy.name}</label>
            <input id="account-type-name" name="name" className="field" maxLength={80} required />
          </div>
          <div className="form-field">
            <label htmlFor="account-type-base">{copy.baseType}</label>
            <Select id="account-type-base" name="baseType" defaultValue="CHECKING" options={accountTypes.map((type) => ({ value: type, label: copy.accountTypes[type] }))} />
          </div>
          <button className="button form-submit" type="submit" disabled={typesAction.pending}>{copy.addAccountType}</button>
        </form>
        <NoticeLine notice={typesAction.notice} />
      </section>

      <section className="card" aria-labelledby="categories-title">
        <h2 id="categories-title">{copy.categoriesSection}</h2>
        {visibleCategories.length === 0 ? (
          <div className="empty-inline">
            <p>{copy.categoriesEmpty}</p>
            <p className="hint">{copy.starterHint}</p>
            <button
              className="button" type="button" disabled={categoriesAction.pending}
              onClick={() => categoriesAction.run(() => call("POST", "/categories/starter", { locale }), copy.categoryAdded)}
            >
              {copy.starterCategories}
            </button>
          </div>
        ) : (
          <ul className="rows">
            {visibleCategories.map((category) => (
              <Row
                key={category.id} locale={locale} name={category.name} archived={category.archived}
                meta={copy.kinds[category.kind]} metaTone={category.kind === "INCOME" ? "positive" : "negative"}
                logo={<span className="account-logo-thumbnail" aria-hidden="true"><Icon name={categoryIcon(category.name, category.kind)} size={20} /></span>}
                onRename={(name) => categoriesAction.run(() => call("PATCH", `/categories/${category.id}`, { name }), copy.saved)}
                onArchive={() => categoriesAction.run(() => call("PATCH", `/categories/${category.id}`, { archived: !category.archived }), copy.saved)}
                confirmDelete={copy.confirmDeleteCategory(category.name)}
                onDelete={() => void categoriesAction.run(() => call("DELETE", `/categories/${category.id}`), copy.removed)}
              />
            ))}
          </ul>
        )}
        <form
          className="form-grid"
          aria-label={copy.newCategory}
          onSubmit={async (event) => {
            const form = event.currentTarget;
            const data = formData(event);
            const result = await categoriesAction.run(
              () => call("POST", "/categories", { name: String(data.get("name") ?? ""), kind: String(data.get("kind")) }),
              copy.categoryAdded,
            );
            if (result) form.reset();
          }}
        >
          <div className="form-field">
            <label htmlFor="category-name">{copy.name}</label>
            <input id="category-name" name="name" className="field" maxLength={80} required />
          </div>
          <div className="form-field">
            <label htmlFor="category-kind">{copy.categoryKind}</label>
            <Select id="category-kind" name="kind" defaultValue="EXPENSE" options={[
              { value: "EXPENSE", label: copy.kinds.EXPENSE }, { value: "INCOME", label: copy.kinds.INCOME },
            ]} />
          </div>
          <button className="button form-submit" type="submit" disabled={categoriesAction.pending}>{copy.addCategory}</button>
        </form>
        <NoticeLine notice={categoriesAction.notice} />
      </section>

      <section className="card" aria-labelledby="rules-title">
        <h2 id="rules-title">{copy.rulesSection}</h2>
        <p className="hint">{copy.rulesIntro}</p>
        {rules.length === 0 ? <p className="empty-inline">{copy.rulesEmpty}</p> : (
          <ul className="rows">
            {rules.map((rule) => (
              <li className="manage-row" key={rule.id}>
                <div className="row-text"><p>{rule.phrase}</p><span>{categoryName.get(rule.categoryId) ?? ""}</span></div>
                <MoreActions label={copy.moreActionsFor(rule.phrase)} title={copy.actions}>
                  <button
                    className="button button-quiet" type="button" disabled={rulesAction.pending}
                    onClick={() => rulesAction.run(() => call("DELETE", `/rules/${rule.id}`), copy.removed)}
                  >
                    {copy.delete}
                  </button>
                </MoreActions>
              </li>
            ))}
          </ul>
        )}
        {activeCategories.length > 0 && (
          <form
            className="form-grid"
            aria-label={copy.addRule}
            onSubmit={async (event) => {
              const form = event.currentTarget;
              const data = formData(event);
              const result = await rulesAction.run(
                () => call("POST", "/rules", { phrase: String(data.get("phrase") ?? ""), categoryId: String(data.get("categoryId")) }),
                copy.ruleAdded,
              );
              if (result) form.reset();
            }}
          >
            <div className="form-field">
              <label htmlFor="rule-phrase">{copy.rulePhrase}</label>
              <input id="rule-phrase" name="phrase" className="field" maxLength={60} required />
            </div>
            <div className="form-field">
              <label htmlFor="rule-category">{copy.category}</label>
              <Select id="rule-category" name="categoryId" options={activeCategories.map((category) => ({ value: category.id, label: category.name }))} />
            </div>
            <button className="button form-submit" type="submit" disabled={rulesAction.pending}>{copy.addRule}</button>
          </form>
        )}
        <NoticeLine notice={rulesAction.notice} />
      </section>
    </div>
  );
}
