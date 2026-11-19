// Pure helpers for the new-movement form (no React, so they can be unit tested).

/** A suggestion remembers the description it was computed for. */
export type Suggestion = { description: string; categoryId: string | null };

/** A suggestion is shown only while the description is still the one it answered. */
export function currentSuggestion(suggestion: Suggestion | null, description: string) {
  return suggestion && suggestion.description === description && description.trim() ? suggestion.categoryId : null;
}

type MovementInput = {
  accountId: string;
  bookingDate: string;
  description: string;
  /** Signed integer cents. */
  amountCents: number;
  /** null until the person picks a category; "" means they chose "No category". */
  manualCategory: string | null;
  rememberPhrase: string;
};

/**
 * The request body for a new movement. A manual choice is always sent, including "no category" as
 * null, so it beats any rule. With no manual choice the category is omitted and the server's rule
 * matching is the single authority, even if the suggestion lookup has not answered yet.
 */
export function movementBody(input: MovementInput) {
  const phrase = input.rememberPhrase.trim();
  return {
    accountId: input.accountId,
    bookingDate: input.bookingDate,
    description: input.description,
    amountCents: input.amountCents,
    ...(input.manualCategory === null ? {} : { categoryId: input.manualCategory || null }),
    ...(phrase ? { rememberPhrase: phrase } : {}),
  };
}
