"use client";

import { useEffect, useId, useRef, useState } from "react";

type Ask = { message: string; confirmLabel: string; danger: boolean; resolve: (ok: boolean) => void };

/**
 * App-styled replacement for window.confirm. `confirm(...)` resolves true or false; render `dialog` once in the view.
 * Built on <dialog>.showModal(), so the browser traps focus, blocks the page behind it and closes it on Escape.
 */
export function useConfirm(cancelLabel: string) {
  const [ask, setAsk] = useState<Ask | null>(null);
  const confirm = (message: string, confirmLabel: string, danger = false) =>
    new Promise<boolean>((resolve) => setAsk({ message, confirmLabel, danger, resolve }));
  const dialog = ask && <ConfirmDialog ask={ask} cancelLabel={cancelLabel} done={(ok) => { ask.resolve(ok); setAsk(null); }} />;
  return { confirm, dialog };
}

function ConfirmDialog({ ask, cancelLabel, done }: { ask: Ask; cancelLabel: string; done: (ok: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const messageId = useId();
  useEffect(() => { if (!ref.current?.open) ref.current?.showModal(); }, []);
  return (
    // Cancel comes first so it takes the initial focus: an accidental Enter never confirms a destructive action.
    <dialog ref={ref} className="confirm-dialog" aria-describedby={messageId}
      onCancel={(event) => { event.preventDefault(); done(false); }}
      onClick={(event) => { if (event.target === ref.current) done(false); }}>
      <p id={messageId}>{ask.message}</p>
      <div className="confirm-actions">
        <button className="button button-quiet" type="button" onClick={() => done(false)}>{cancelLabel}</button>
        <button className={`button button-solid${ask.danger ? " confirm-danger" : ""}`} type="button" onClick={() => done(true)}>{ask.confirmLabel}</button>
      </div>
    </dialog>
  );
}
