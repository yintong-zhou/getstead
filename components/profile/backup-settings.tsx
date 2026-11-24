"use client";

import { useState } from "react";
import type { Locale } from "@/server/locale";
import { call } from "../cash-flow/api";
import { NoticeLine, useAction } from "../cash-flow/use-action";
import { profileCopy } from "./copy";

type Counts = { accounts: number; movements: number; instruments: number; properties: number };

export function BackupSettings({ locale }: { locale: Locale }) {
  const copy = profileCopy[locale];
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const request = useAction(locale, (result) => copy.errors[result.error] ?? copy.errors.generic);

  function reset() {
    setFile(null);
    setInputKey((key) => key + 1);
  }

  async function restore() {
    if (!file) return;
    // Some systems report no type for .json files; the server only accepts application/json.
    const body = new Blob([file], { type: "application/json" });
    const result = await request.run(() => call<Counts>("POST", "/backup", body, "/api"),
      (counts) => ({ kind: "ok", text: copy.backup.imported(counts) }));
    if (result) reset();
  }

  return <section className="card profile-card" aria-labelledby="profile-backup-title">
    <h2 id="profile-backup-title">{copy.backup.title}</h2>
    <p className="profile-hint">{copy.backup.exportHint}</p>
    <a className="button" href="/api/backup" download>{copy.backup.export}</a>
    <div className="form-field backup-file-field">
      <label htmlFor="backup-file">{copy.backup.importLabel}</label>
      <input key={inputKey} className="field" id="backup-file" type="file" accept="application/json,.json" aria-describedby="backup-file-hint"
        onChange={(event) => { request.setNotice(null); setFile(event.currentTarget.files?.[0] ?? null); }} />
      <p className="profile-hint" id="backup-file-hint">{copy.backup.importHint}</p>
    </div>
    {file && <>
      <p className="profile-hint backup-confirm">{copy.backup.confirm(file.name)}</p>
      <div className="profile-languages">
        <button type="button" className="button" disabled={request.pending} onClick={restore}>
          {request.pending ? copy.backup.importing : copy.backup.import}
        </button>
        <button type="button" className="button button-quiet" disabled={request.pending} onClick={reset}>{copy.cancel}</button>
      </div>
    </>}
    <NoticeLine notice={request.notice} />
  </section>;
}
