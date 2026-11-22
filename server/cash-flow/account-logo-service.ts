import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "../auth/database.ts";
import { reserveAttempt } from "../auth/limits.ts";
import { getRemoteLogo } from "./bank-logos.ts";
import { ApiError, notFound } from "./errors.ts";
import { findCatalogLogo, logoAccountTypes, logoCatalog, supportsAccountLogo } from "./logo-catalog.ts";
import { decryptBytes, encryptBytes } from "./text-crypto.ts";
import { Reader } from "./validate.ts";

const logoContext = (accountId: string) => `account-logo:${accountId}`;
const identity = (userId: string, accountId: string) => ({ userId, accountId });

async function requireLogoAccount(userId: string, accountId: string) {
  const account = await db().account.findFirst({
    where: { id: accountId, userId, type: { in: [...logoAccountTypes] } },
    select: { name: true },
  });
  if (!account) throw notFound();
  return account;
}

export async function readAccountLogo(userId: string, accountId: string) {
  const row = await db().accountLogo.findFirst({
    where: { ...identity(userId, accountId), account: { type: { in: [...logoAccountTypes] } } },
    select: { image: true },
  });
  if (!row) throw notFound();
  return decryptBytes(userId, logoContext(accountId), row.image);
}

async function saveLogo(userId: string, accountId: string, bytes: Uint8Array, automaticName?: string) {
  const key = identity(userId, accountId);
  const image = encryptBytes(userId, logoContext(accountId), bytes);
  await db().$transaction(async (tx) => {
    const [account] = await tx.$queryRaw<{ name: string; type: string }[]>`
      SELECT name, type FROM stead_accounts WHERE user_id = ${userId}::uuid AND account_id = ${accountId}::uuid FOR NO KEY UPDATE
    `;
    if (!account || !supportsAccountLogo(account.type)) throw notFound();
    if (automaticName !== undefined) {
      if (account.name !== automaticName) throw new ApiError(409, "logo_account_changed");
      await tx.accountLogo.createMany({ data: { ...key, image }, skipDuplicates: true });
    } else {
      await tx.accountLogo.upsert({ where: { userId_accountId: key }, create: { ...key, image }, update: { image } });
    }
  });
}

export async function findAccountLogo(userId: string, accountId: string, input: Record<string, unknown>) {
  const { name } = await requireLogoAccount(userId, accountId);
  const reader = new Reader(input);
  const lookup = reader.optionalBool("lookup");
  const providedUrl = reader.optionalText("url", 2048);
  const providerId = reader.optionalText("provider", 80);
  reader.done();
  const choices = [lookup, providedUrl, providerId].filter((value) => value !== undefined);
  if (choices.length !== 1 || lookup === false) throw new ApiError(400, "logo_invalid_url");
  if (providedUrl) {
    if (!await reserveAttempt("logo", userId)) throw new ApiError(429, "logo_rate_limit");
    await saveLogo(userId, accountId, await getRemoteLogo(providedUrl));
    return;
  }
  const provider = lookup ? findCatalogLogo(name) : logoCatalog.find(({ id }) => id === providerId);
  if (!provider) throw new ApiError(422, "logo_not_found");
  const image = await readFile(join(process.cwd(), "public", "account-logos", `${provider.id}.webp`));
  await saveLogo(userId, accountId, image, lookup ? name : undefined);
}

export async function removeAccountLogo(userId: string, accountId: string) {
  await requireLogoAccount(userId, accountId);
  await db().accountLogo.deleteMany({ where: { ...identity(userId, accountId), account: { type: { in: [...logoAccountTypes] } } } });
}
