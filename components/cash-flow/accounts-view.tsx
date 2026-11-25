"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { AccountDto, CategoryDto } from "@/server/cash-flow/catalog";
import { accountInstitution, findCatalogLogo, logoGroupsByType } from "@/server/cash-flow/logo-catalog";
import type { RuleDto } from "@/server/cash-flow/rules";
import { formatEuros, type Locale } from "@/server/locale";
import { categoryIcon } from "../category-icon";
import { Icon } from "../icon";
import { amountInputProps } from "../amount-input";
import { parseLimit } from "../money";
import { Select } from "../select";
import { AccountLogoControls, AccountLogoThumbnail, accountLogoLabel, accountLogoPath } from "./account-logo";
import { call } from "./api";
import { cashFlowCopy } from "./copy";
import { MoreActions } from "./more-actions";
import { useConfirm } from "../confirm-dialog";
import { NoticeLine, useAction } from "./use-action";
import { euros } from "../euros";
import { AccountGroup } from "../account-group";
import { groupByInstitution } from "../account-groups";

const accountTypes = ["CHECKING", "SAVINGS", "CARD", "CASH", "BROKERAGE", "CRYPTO", "PENSION", "DEBT"] as const;
type BaseType = AccountDto["type"];

type Balance = { balanceCents: number; holdingsCents: number };
type Props = {
  locale: Locale; accounts: AccountDto[]; categories: CategoryDto[]; rules: RuleDto[];
  /** Cash and securities per account id. */
  balances: Record<string, Balance>;
};

const typeOptions = (locale: Locale) => accountTypes.map((type) => ({ value: type, label: cashFlowCopy[locale].accountTypes[type] }));

function formData(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  return new FormData(event.currentTarget);
}

function Row({ locale, name, meta, archived, logo, menuItems, amount, confirmDelete, metaTone, onRename, onArchive, onDelete }: {
  locale: Locale; name: string; meta: string; archived: boolean; confirmDelete: string; metaTone?: "positive" | "negative";
  logo?: ReactNode; menuItems?: ReactNode; amount?: ReactNode;
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
          {amount}
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
function TypeForm({ locale, account, action, onDone }: {
  locale: Locale; account: AccountDto; action: ReturnType<typeof useAction>; onDone: () => void;
}) {
  const copy = cashFlowCopy[locale];
  const [value, setValue] = useState<string>(account.type);
  const id = useId();
  return (
    <form
      className="inline-form"
      aria-label={`${copy.changeType}: ${account.name}`}
      onSubmit={async (event) => {
        event.preventDefault();
        if (value === account.type) return onDone();
        if (await action.run(() => call("PATCH", `/accounts/${account.id}`, { type: value }), copy.typeChanged)) onDone();
      }}
    >
      <label className="visually-hidden" htmlFor={id}>{copy.accountType}</label>
      <Select id={id} value={value} onChange={setValue} options={typeOptions(locale)} />
      <button className="button" type="submit" disabled={action.pending}>{copy.save}</button>
      <button className="button button-quiet" type="button" onClick={onDone}>{copy.cancel}</button>
    </form>
  );
}

/** Sets the account's bank or broker; an empty value goes back to recognising it from the name. */
function InstitutionForm({ locale, account, action, onDone }: {
  locale: Locale; account: AccountDto; action: ReturnType<typeof useAction>; onDone: () => void;
}) {
  const copy = cashFlowCopy[locale];
  const id = useId();
  return (
    <form
      className="inline-form"
      aria-label={`${copy.changeInstitution}: ${account.name}`}
      onSubmit={async (event) => {
        const value = String(formData(event).get("institution") ?? "").trim();
        if (value === (account.institution ?? "")) return onDone();
        if (await action.run(() => call("PATCH", `/accounts/${account.id}`, { institution: value || null }), copy.institutionSaved)) onDone();
      }}
    >
      <label className="visually-hidden" htmlFor={id}>{copy.institution}</label>
      <input id={id} name="institution" className="field" maxLength={80} defaultValue={account.institution ?? ""}
        placeholder={findCatalogLogo(account.name)?.name ?? ""} autoFocus />
      <button className="button" type="submit" disabled={action.pending}>{copy.save}</button>
      <button className="button button-quiet" type="button" onClick={onDone}>{copy.cancel}</button>
    </form>
  );
}

function AccountRow({ locale, account, lookup, action, balance }: {
  locale: Locale; account: AccountDto; lookup?: "pending" | "failed"; action: ReturnType<typeof useAction>; balance?: Balance;
}) {
  const copy = cashFlowCopy[locale];
  const [logoOpen, setLogoOpen] = useState<boolean>();
  const [typeOpen, setTypeOpen] = useState(false);
  const [institutionOpen, setInstitutionOpen] = useState(false);
  const holdings = balance?.holdingsCents ?? 0;
  const meta = copy.accountTypes[account.type] + (balance && holdings
    ? ` · ${copy.cashLine} ${formatEuros(balance.balanceCents, locale)} · ${copy.securitiesLine} ${formatEuros(holdings, locale)}`
    : "");
  const showLogo = logoOpen ?? lookup === "failed";
  const path = `/accounts/${account.id}`;

  return (
    <Row
      locale={locale} name={account.name} archived={account.archived} meta={meta}
      amount={balance && <span className={`amount${balance.balanceCents + holdings < 0 ? " negative" : ""}`}>{euros(balance.balanceCents + holdings, locale)}</span>}
      confirmDelete={copy.confirmDeleteAccount(account.name)}
      logo={<>
        {typeOpen && <TypeForm locale={locale} account={account} action={action} onDone={() => setTypeOpen(false)} />}
        {institutionOpen && <InstitutionForm locale={locale} account={account} action={action} onDone={() => setInstitutionOpen(false)} />}
        <AccountLogoControls account={account} locale={locale} lookup={lookup} open={showLogo} onDone={() => setLogoOpen(false)} />
      </>}
      menuItems={(<>
        <button className="button button-quiet" type="button" aria-expanded={typeOpen} onClick={() => setTypeOpen(!typeOpen)}>
          {copy.changeType}
        </button>
        <button className="button button-quiet" type="button" aria-expanded={institutionOpen} onClick={() => setInstitutionOpen(!institutionOpen)}>
          {copy.changeInstitution}
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

/**
 * Modal shell for an "add" form. Errors stay inside it: a toast renders in the page behind the modal, where nobody can see it.
 * Esc and a click outside close it, unless a request is running.
 */
function FormDialog({ locale, title, submitLabel, action, onClose, onSubmit, children }: {
  locale: Locale; title: string; submitLabel: string; action: ReturnType<typeof useAction>; onClose: () => void;
  onSubmit: (data: FormData) => Promise<void>; children: ReactNode;
}) {
  const copy = cashFlowCopy[locale];
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog ref={ref} className="confirm-dialog account-dialog" aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); if (!action.pending) onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget && !action.pending) onClose(); }}>
      <h2 id={titleId}>{title}</h2>
      <form className="form-grid" onSubmit={(event) => onSubmit(formData(event))}>
        {children}
        {action.notice?.kind === "error" && <p className="dialog-error wide" role="alert">{action.notice.text}</p>}
        <div className="confirm-actions wide">
          <button className="button button-quiet" type="button" disabled={action.pending} onClick={onClose}>{copy.cancel}</button>
          <button className="button button-solid" type="submit" disabled={action.pending}>{submitLabel}</button>
        </div>
      </form>
    </dialog>
  );
}

function NewAccountDialog({ locale, action, onClose, onCreated }: {
  locale: Locale; action: ReturnType<typeof useAction>; onClose: () => void; onCreated: (account: AccountDto) => void;
}) {
  const copy = cashFlowCopy[locale];
  const [suggestedInstitution, setSuggestedInstitution] = useState("");

  return (
    <FormDialog locale={locale} title={copy.newAccount} submitLabel={copy.addAccount} action={action} onClose={onClose}
      onSubmit={async (data) => {
        const type = String(data.get("type")) as BaseType;
        const balanceText = String(data.get("balance") ?? "").trim();
        const institution = String(data.get("institution") ?? "").trim();
        const cents = balanceText ? parseLimit(balanceText) : undefined;
        if (cents === null) {
          action.setNotice({ kind: "error", text: copy.openingBalanceError });
          return;
        }
        // Cards and debts hold what you owe: the amount typed is stored as negative.
        const openingBalanceCents = cents === undefined ? undefined : type === "CARD" || type === "DEBT" ? -cents : cents;
        const result = await action.run(
          () => call<AccountDto>("POST", "/accounts", {
            name: String(data.get("name") ?? ""), type, ...(cents === undefined ? {} : { openingBalanceCents }),
            ...(institution ? { institution } : {}),
          }),
          copy.accountAdded,
        );
        if (result) onCreated(result.data);
      }}
    >
      <div className="form-field">
        <label htmlFor="account-name">{copy.name}</label>
        <input id="account-name" name="name" className="field" maxLength={80} required autoFocus
          onChange={(event) => setSuggestedInstitution(findCatalogLogo(event.target.value)?.name ?? "")} />
      </div>
      <div className="form-field">
        <label htmlFor="account-institution">{copy.institution}</label>
        <input id="account-institution" name="institution" className="field" maxLength={80} placeholder={suggestedInstitution}
          aria-describedby="account-institution-hint" />
        <p className="hint" id="account-institution-hint">{copy.institutionHint}</p>
      </div>
      <div className="form-field">
        <label htmlFor="account-type">{copy.accountType}</label>
        <Select id="account-type" name="type" defaultValue="CHECKING" options={typeOptions(locale)} />
      </div>
      <div className="form-field">
        <label htmlFor="account-balance">{copy.openingBalance}</label>
        <input id="account-balance" name="balance" className="field amount-field" {...amountInputProps(locale, parseLimit)} aria-describedby="account-balance-hint" />
        <p className="hint" id="account-balance-hint">{copy.openingBalanceHint}</p>
      </div>
    </FormDialog>
  );
}

function NewCategoryDialog({ locale, action, onClose }: { locale: Locale; action: ReturnType<typeof useAction>; onClose: () => void }) {
  const copy = cashFlowCopy[locale];
  return (
    <FormDialog locale={locale} title={copy.newCategory} submitLabel={copy.addCategory} action={action} onClose={onClose}
      onSubmit={async (data) => {
        const result = await action.run(
          () => call("POST", "/categories", { name: String(data.get("name") ?? ""), kind: String(data.get("kind")) }),
          copy.categoryAdded,
        );
        if (result) onClose();
      }}
    >
      <div className="form-field">
        <label htmlFor="category-name">{copy.name}</label>
        <input id="category-name" name="name" className="field" maxLength={80} required autoFocus />
      </div>
      <div className="form-field">
        <label htmlFor="category-kind">{copy.categoryKind}</label>
        <Select id="category-kind" name="kind" defaultValue="EXPENSE" options={[
          { value: "EXPENSE", label: copy.kinds.EXPENSE }, { value: "INCOME", label: copy.kinds.INCOME },
        ]} />
      </div>
    </FormDialog>
  );
}

export function AccountsView({ locale, accounts, categories, rules, balances }: Props) {
  const copy = cashFlowCopy[locale];
  const router = useRouter();
  const accountsAction = useAction(locale);
  const categoriesAction = useAction(locale);
  const rulesAction = useAction(locale);
  const [showArchived, setShowArchived] = useState(false);
  const [lookups, setLookups] = useState(() => new Map<string, "pending" | "failed">());
  const [addOpen, setAddOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const categoryName = new Map(categories.map((category) => [category.id, category.name]));
  const visibleAccounts = accounts.filter((account) => showArchived || !account.archived);
  const visibleCategories = categories.filter((category) => showArchived || !category.archived);
  const hasArchived = accounts.some((account) => account.archived) || categories.some((category) => category.archived);
  const activeCategories = categories.filter((category) => !category.archived);

  /** Closes the dialog, then looks the new account's logo up in the catalog, which can take a moment. */
  async function afterCreate({ id, type }: AccountDto) {
    setAddOpen(false);
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
  }

  return (
    <div className="stack stack-fluid">
      <section className="card stack-half" aria-labelledby="accounts-title">
        <header className="card-head">
          <h2 id="accounts-title">{copy.accountsSection}</h2>
          <div className="card-head-actions">
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
            <button className="icon-button" type="button" aria-label={copy.newAccount} aria-haspopup="dialog" onClick={() => { accountsAction.setNotice(null); setAddOpen(true); }}>
              <Icon name="plus" size={20} />
            </button>
          </div>
        </header>
        {visibleAccounts.length === 0 ? <p className="empty-inline">{copy.accountsEmpty}</p> : (
          <ul className="rows">
            {groupByInstitution(visibleAccounts, accountInstitution).map((item) => {
              const row = (account: AccountDto) => (
                <AccountRow key={account.id} locale={locale} account={account} lookup={lookups.get(account.id)}
                  action={accountsAction} balance={balances[account.id]} />
              );
              if (item.kind === "account") return row(item.account);
              const groupLogoId = item.accounts.find((account) => account.hasLogo)?.id;
              const totalCents = item.accounts.reduce((sum, { id }) => sum + (balances[id]?.balanceCents ?? 0) + (balances[id]?.holdingsCents ?? 0), 0);
              return (
                <AccountGroup key={item.key} groupKey={item.key} name={item.name} count={item.accounts.length} totalCents={totalCents} locale={locale}
                  logo={<AccountLogoThumbnail src={groupLogoId ? `/api/cash-flow${accountLogoPath(groupLogoId)}?v=0` : null} />}>
                  {item.accounts.map(row)}
                </AccountGroup>
              );
            })}
          </ul>
        )}
        <NoticeLine notice={addOpen ? null : accountsAction.notice} />
        {addOpen && <NewAccountDialog locale={locale} action={accountsAction} onClose={() => setAddOpen(false)} onCreated={afterCreate} />}
      </section>

      <section className="card stack-half" aria-labelledby="categories-title">
        <header className="card-head">
          <h2 id="categories-title">{copy.categoriesSection}</h2>
          <button className="icon-button" type="button" aria-label={copy.newCategory} aria-haspopup="dialog"
            onClick={() => { categoriesAction.setNotice(null); setCategoryOpen(true); }}>
            <Icon name="plus" size={20} />
          </button>
        </header>
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
        <NoticeLine notice={categoryOpen ? null : categoriesAction.notice} />
        {categoryOpen && <NewCategoryDialog locale={locale} action={categoriesAction} onClose={() => setCategoryOpen(false)} />}
      </section>

      <section className="card stack-half" aria-labelledby="rules-title">
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
