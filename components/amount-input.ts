import type { FocusEvent } from "react";
import type { Locale } from "../server/locale.ts";
import { editableEuros } from "./money.ts";

export function amountInputProps(
  locale: Locale,
  parse: (text: string) => number | string | null,
  setValue?: (value: string) => void,
) {
  return {
    inputMode: "text" as const,
    autoComplete: "off",
    autoCorrect: "off",
    spellCheck: false,
    onBlur(event: FocusEvent<HTMLInputElement>) {
      const input = event.currentTarget;
      if (!/[+-]/.test(input.value)) return;
      const result = parse(input.value);
      if (result === null) return;
      const formatted = typeof result === "number" ? editableEuros(result, locale)
        : locale === "it" ? result.replace(".", ",") : result;
      if (setValue) setValue(formatted);
      else input.value = formatted;
    },
  };
}
