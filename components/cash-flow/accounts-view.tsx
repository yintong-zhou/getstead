"use client";

import { useId, useState, type FormEvent } from "react";
import type { AccountDto, CategoryDto } from "@/server/cash-flow/catalog";
import type { RuleDto } from "@/server/cash-flow/rules";
import type { Locale } from "@/server/locale";
import { call } from "./api";
import { cashFlowCopy } from "./copy";
import { NoticeLine, useAction } from "./use-action";

const accountTypes = ["CHECKING", "CARD", "CASH", "BROKERAGE", "CRYPTO", "DEBT"] as const;

type Props = { locale: Locale; accounts: AccountDto[]; categories: CategoryDto[]; rules: RuleDto[] };

function formData(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  return new FormData(event.currentTarget);
}

function Row({ locale, name, meta, archived, onRename, onArchive }: {
  locale: Locale; name: string; meta: string; archived: boolean;
  onRename: (name: string) => void; onArchive: () => void;
}) {
  const copy = cashFlowCopy[locale];
  const [editing, setEditing] = useState(false);
  const inputId = useId();

  return (
    <li className={`manage-row${archived ? " is-archived" : ""}`}>
      {editing ? (
        <form
          className="inline-form"
          onSubmit={(event) => {
            const value = String(formData(event).get("name") ?? "").trim();
            if (value) onRename(value);
            setEditing(false);
          }}
        >
          <label className="visually-hidden" htmlFor={inputId}>{copy.name}</label>
          <input id={inputId} name="name" className="field" defaultValue={name} maxLength={80} required autoFocus />
          <button className="button" type="submit">{copy.save}</button>
          <button className="button button-quiet" type="button" onClick={() => setEditing(false)}>{copy.cancel}</button>
        </form>
      ) : (
        <>
          <div className="row-text">
            <p>{name}</p>
            <span>{meta}{archived ? ` · ${copy.archivedSuffix}` : ""}</span>
          </div>
          <div className="row-actions">
            <button className="button button-quiet" type="button" onClick={() => setEditing(true)}>{copy.edit}</button>
            <button className="button button-quiet" type="button" onClick={onArchive}>{archived ? copy.restore : copy.archive}</button>
          </div>
        </>
      )}
    </li>
  );
}

export function AccountsView({ locale, accounts, categories, rules }: Props) {
  const copy = cashFlowCopy[locale];
  const accountsAction = useAction(locale);
  const categoriesAction = useAction(locale);
  const rulesAction = useAction(locale);
  const [showArchived, setShowArchived] = useState(false);
  const categoryName = new Map(categories.map((category) => [category.id, category.name]));
  const visibleAccounts = accounts.filter((account) => showArchived || !account.archived);
  const visibleCategories = categories.filter((category) => showArchived || !category.archived);
  const hasArchived = accounts.some((account) => account.archived) || categories.some((category) => category.archived);
  const activeCategories = categories.filter((category) => !category.archived);

  return (
    <div className="stack">
      {hasArchived && (
        <label className="check">
          <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
          {copy.showArchived}
        </label>
      )}

      <section className="card" aria-labelledby="accounts-title">
        <h2 id="accounts-title">{copy.accountsSection}</h2>
        {visibleAccounts.length === 0 ? <p className="empty-inline">{copy.accountsEmpty}</p> : (
          <ul className="rows">
            {visibleAccounts.map((account) => (
              <Row
                key={account.id} locale={locale} name={account.name} archived={account.archived}
                meta={copy.accountTypes[account.type]}
                onRename={(name) => accountsAction.run(() => call("PATCH", `/accounts/${account.id}`, { name }), copy.saved)}
                onArchive={() => accountsAction.run(() => call("PATCH", `/accounts/${account.id}`, { archived: !account.archived }), copy.saved)}
              />
            ))}
          </ul>
        )}
        <form
          className="form-grid"
          aria-label={copy.newAccount}
          onSubmit={async (event) => {
            const form = event.currentTarget;
            const data = formData(event);
            const result = await accountsAction.run(
              () => call("POST", "/accounts", { name: String(data.get("name") ?? ""), type: String(data.get("type")) }),
              copy.accountAdded,
            );
            if (result) form.reset();
          }}
        >
          <div className="form-field">
            <label htmlFor="account-name">{copy.name}</label>
            <input id="account-name" name="name" className="field" maxLength={80} required />
          </div>
          <div className="form-field">
            <label htmlFor="account-type">{copy.accountType}</label>
            <select id="account-type" name="type" className="field" defaultValue="CHECKING">
              {accountTypes.map((type) => <option key={type} value={type}>{copy.accountTypes[type]}</option>)}
            </select>
          </div>
          <button className="button form-submit" type="submit" disabled={accountsAction.pending}>{copy.addAccount}</button>
        </form>
        <NoticeLine notice={accountsAction.notice} />
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
                meta={copy.kinds[category.kind]}
                onRename={(name) => categoriesAction.run(() => call("PATCH", `/categories/${category.id}`, { name }), copy.saved)}
                onArchive={() => categoriesAction.run(() => call("PATCH", `/categories/${category.id}`, { archived: !category.archived }), copy.saved)}
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
            <select id="category-kind" name="kind" className="field" defaultValue="EXPENSE">
              <option value="EXPENSE">{copy.kinds.EXPENSE}</option>
              <option value="INCOME">{copy.kinds.INCOME}</option>
            </select>
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
                <div className="row-actions">
                  <button
                    className="button button-quiet" type="button" disabled={rulesAction.pending}
                    aria-label={`${copy.delete}: ${rule.phrase}`}
                    onClick={() => rulesAction.run(() => call("DELETE", `/rules/${rule.id}`), copy.removed)}
                  >
                    {copy.delete}
                  </button>
                </div>
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
              <select id="rule-category" name="categoryId" className="field">
                {activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </div>
            <button className="button form-submit" type="submit" disabled={rulesAction.pending}>{copy.addRule}</button>
          </form>
        )}
        <NoticeLine notice={rulesAction.notice} />
      </section>
    </div>
  );
}
