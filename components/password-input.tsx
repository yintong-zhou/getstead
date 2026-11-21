"use client";

import { useState, type ComponentProps } from "react";
import type { Locale } from "@/server/locale";
import { Icon } from "./icon";

const labels = { en: { show: "Show password", hide: "Hide password" }, it: { show: "Mostra password", hide: "Nascondi password" } } as const;

/** A password field with a show/hide toggle. Takes the same props as `<input>`; the toggle is a keyboard-reachable button. */
export function PasswordInput({ locale, ...props }: Omit<ComponentProps<"input">, "type"> & { locale: Locale }) {
  const [shown, setShown] = useState(false);
  const label = labels[locale][shown ? "hide" : "show"];
  return (
    <div className="password-input">
      <input {...props} type={shown ? "text" : "password"} autoCapitalize="none" spellCheck={false} />
      <button type="button" className="password-toggle" aria-label={label} title={label} onClick={() => setShown(!shown)}>
        <Icon name={shown ? "eyeOff" : "eye"} size={20} />
      </button>
    </div>
  );
}
