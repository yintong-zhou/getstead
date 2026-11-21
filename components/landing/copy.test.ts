import assert from "node:assert/strict";
import { test } from "node:test";
import { landingCopy } from "./copy.ts";
import { privacyCopy } from "./privacy-copy.ts";

/** Every key path and array length, so a string added to one language and not the other fails. */
function shape(value: unknown, path = ""): string[] {
  if (typeof value === "string") return [`${path}:string`];
  if (Array.isArray(value)) return [`${path}:[${value.length}]`, ...value.flatMap((item, index) => shape(item, `${path}[${index}]`))];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => shape(item, `${path}.${key}`));
}

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  return Object.values(value as Record<string, unknown>).flatMap(strings);
}

for (const [name, copy] of [["landing", landingCopy], ["privacy", privacyCopy]] as const) {
  test(`${name} copy has the same keys in English and Italian`, () => {
    assert.deepEqual(shape(copy.it), shape(copy.en));
  });

  test(`${name} copy has no empty strings`, () => {
    for (const locale of ["en", "it"] as const) for (const text of strings(copy[locale])) assert.notEqual(text.trim(), "", `${locale} has an empty string`);
  });
}

test("the home promises nothing the app does not do", () => {
  const banned = /\b(pro|premium|bank-grade|ai|open banking|sync automatically|import(?:a|are)? .*csv)\b/i;
  // The limits are stated on purpose ("no bank sync", "no CSV import yet"), so only claims are checked.
  for (const locale of ["en", "it"] as const) {
    const claims = [landingCopy[locale].hero.lead, landingCopy[locale].hero.title, landingCopy[locale].metaDescription, ...landingCopy[locale].cashFlow.points];
    for (const text of claims) assert.doesNotMatch(text, banned);
  }
});

test("meta titles and descriptions stay within search result lengths", () => {
  for (const locale of ["en", "it"] as const) {
    const { metaTitle, metaDescription } = landingCopy[locale];
    assert.ok(`${metaTitle} | getstead`.length <= 60, `${locale} title is too long`);
    assert.ok(metaDescription.length >= 110 && metaDescription.length <= 160, `${locale} description is ${metaDescription.length} characters`);
  }
});
