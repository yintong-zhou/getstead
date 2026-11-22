"use client";

import Image from "next/image";
import { useId, useState } from "react";
import type { AccountDto } from "@/server/cash-flow/catalog";
import { catalogLogoPath, logoCatalog } from "@/server/cash-flow/logo-catalog";
import type { Locale } from "@/server/locale";
import { Icon } from "../icon";
import { Select } from "../select";
import { call, type ApiResult } from "./api";
import { NoticeLine, useAction } from "./use-action";

const copy = {
  en: {
    manage: "Logo", finding: "Looking up the logo…",
    missing: "No logo found. Choose a provider or paste a link.",
    find: "Match account name",
    provider: "Bank or broker", pick: "Choose a provider", banks: "Banks and digital accounts",
    brokers: "Brokers", useCatalog: "Use logo",
    url: "Image or website link", useLink: "Use link", remove: "Remove logo",
    saved: "Logo saved.", removed: "Logo removed.",
    invalid: "Choose a valid PNG, JPEG or WebP image.",
    large: "Choose an image no larger than 256 KB.",
    invalidUrl: "Enter a public HTTPS link.",
    limited: "Too many searches. Try again in a few minutes.",
    changed: "The account changed. Try again.",
    failed: "Couldn’t update the logo. Try again.",
  },
  it: {
    manage: "Logo", finding: "Ricerca del logo…",
    missing: "Logo non trovato. Scegli una banca o un broker oppure incolla un link.",
    find: "Cerca dal nome",
    provider: "Banca o broker", pick: "Scegli un istituto", banks: "Banche e conti digitali",
    brokers: "Broker", useCatalog: "Usa il logo",
    url: "Link all’immagine o al sito", useLink: "Usa il link", remove: "Rimuovi logo",
    saved: "Logo salvato.", removed: "Logo rimosso.",
    invalid: "Scegli un’immagine PNG, JPEG o WebP valida.",
    large: "Scegli un’immagine di massimo 256 KB.",
    invalidUrl: "Inserisci un link HTTPS pubblico.",
    limited: "Troppe ricerche. Riprova tra qualche minuto.",
    changed: "Il conto è cambiato. Riprova.",
    failed: "Impossibile aggiornare il logo. Riprova.",
  },
};

export const accountLogoPath = (id: string) => `/accounts/${id}/logo`;
const catalogOptions = (group: "bank" | "broker") =>
  logoCatalog.filter((provider) => provider.group === group).map(({ id, name }) => ({ value: id, label: name }));
const bankOptions = catalogOptions("bank");
const brokerOptions = catalogOptions("broker");

export function AccountLogoThumbnail({ src }: { src: string | null }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className="account-logo-thumbnail" aria-hidden="true">
      {src && !broken
        ? <Image src={src} alt="" width={32} height={32} unoptimized onError={() => setBroken(true)} />
        : <Icon name="accounts" size={20} />}
    </span>
  );
}

export const accountLogoLabel = (locale: Locale) => copy[locale].manage;

/** The logo thumbnail and its panel. The row menu owns the toggle, so `open` is controlled by the row. */
export function AccountLogoControls({ account, locale, lookup, open }: {
  account: AccountDto;
  locale: Locale;
  lookup?: "pending" | "failed";
  open: boolean;
}) {
  const labels = copy[locale];
  const panel = useId();
  const [provider, setProvider] = useState("");
  const [version, setVersion] = useState(0);
  const [visibleLogo, setVisibleLogo] = useState<boolean>();
  const action = useAction(locale, ({ error }) => ({
    logo_not_found: labels.missing,
    logo_invalid_image: labels.invalid,
    logo_too_large: labels.large,
    logo_invalid_url: labels.invalidUrl,
    logo_rate_limit: labels.limited,
    logo_account_changed: labels.changed,
  } as Record<string, string>)[error] ?? labels.failed);
  const busy = lookup === "pending" || action.pending;
  const hasLogo = visibleLogo ?? account.hasLogo;
  const path = accountLogoPath(account.id);
  const image = hasLogo ? `/api/cash-flow${path}?v=${version}` : null;

  async function update(request: () => Promise<ApiResult<unknown>>, keep: boolean) {
    const result = await action.run(request, keep ? labels.saved : labels.removed);
    if (result) {
      setVisibleLogo(keep);
      setVersion((current) => current + 1);
    }
    return result;
  }

  return (
    <>
      <AccountLogoThumbnail key={image} src={image} />
      {lookup === "pending" && <p className="hint account-logo-message" role="status">{labels.finding}</p>}
      <div id={panel} className="account-logo-panel" hidden={!open}>
        {lookup === "failed" && !hasLogo && !action.notice && <p className="hint" role="status">{labels.missing}</p>}
        <div className="row-actions">
          {!hasLogo && <button type="button" className="button button-quiet" disabled={busy}
            onClick={() => void update(() => call("POST", path, { lookup: true }), true)}>{labels.find}</button>}
          {hasLogo && <button type="button" className="button button-quiet" disabled={busy}
            onClick={() => void update(() => call("DELETE", path), false)}>{labels.remove}</button>}
        </div>
        {open && (
          <form className="inline-form account-logo-catalog" onSubmit={(event) => {
            event.preventDefault();
            if (provider) void update(() => call("POST", path, { provider }), true);
          }}>
            <div className="form-field">
              <label htmlFor={`${panel}-provider`}>{labels.provider}</label>
              <Select id={`${panel}-provider`} value={provider} onChange={setProvider} disabled={busy}
                groups={[
                  { label: "", options: [{ value: "", label: labels.pick }] },
                  { label: labels.banks, options: bankOptions },
                  { label: labels.brokers, options: brokerOptions },
                ]}
              />
            </div>
            {provider && <AccountLogoThumbnail key={provider} src={catalogLogoPath(provider)} />}
            <button type="submit" className="button" disabled={busy || !provider}>{labels.useCatalog}</button>
          </form>
        )}
        <form className="inline-form" onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const url = String(new FormData(form).get("url") ?? "");
          if (await update(() => call("POST", path, { url }), true)) form.reset();
        }}>
          <div className="form-field">
            <label htmlFor={`${panel}-url`}>{labels.url}</label>
            <input className="field" id={`${panel}-url`} name="url" type="url" required maxLength={2048} autoComplete="off" spellCheck={false} placeholder="https://example.com/logo.png…" />
          </div>
          <button type="submit" className="button" disabled={busy}>{labels.useLink}</button>
        </form>
        <NoticeLine notice={action.notice} />
      </div>
    </>
  );
}
