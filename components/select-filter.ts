/** Lowercase and strip accents so "perche" finds "Perché". */
export const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase();

/**
 * Keeps the options whose label contains the query, plus `pinned` ones (e.g. "New category"),
 * and drops groups left empty. An empty query keeps everything.
 */
export function filterGroups<O extends { label: string; pinned?: boolean }, G extends { options: O[] }>(groups: G[], query: string): G[] {
  const needle = fold(query.trim());
  if (!needle) return groups;
  return groups
    .map((group) => ({ ...group, options: group.options.filter((option) => option.pinned || fold(option.label).includes(needle)) }))
    .filter((group) => group.options.length > 0);
}
