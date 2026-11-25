/** One account on its own, or two or more accounts of the same institution. */
export type AccountItem<T> = { kind: "account"; account: T } | { kind: "group"; key: string; name: string; accounts: T[] };

const groupKey = (name: string) => name.normalize("NFKD").replace(/\p{M}/gu, "").trim().toLowerCase();

/**
 * Groups accounts that share an institution, keeping the input order: a group takes the place of its first account.
 * An institution with a single account stays a plain account.
 */
export function groupByInstitution<T>(accounts: readonly T[], institutionOf: (account: T) => string | null): AccountItem<T>[] {
  const members = new Map<string, T[]>();
  for (const account of accounts) {
    const name = institutionOf(account);
    if (!name) continue;
    const rows = members.get(groupKey(name));
    if (rows) rows.push(account);
    else members.set(groupKey(name), [account]);
  }
  const items: AccountItem<T>[] = [];
  const placed = new Set<string>();
  for (const account of accounts) {
    const name = institutionOf(account);
    const key = name ? groupKey(name) : null;
    const group = key ? members.get(key)! : null;
    if (!key || !group || group.length < 2) items.push({ kind: "account", account });
    else if (!placed.has(key)) {
      placed.add(key);
      items.push({ kind: "group", key, name: name!, accounts: group });
    }
  }
  return items;
}
