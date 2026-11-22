import type { IconName } from "./icon";
import { fold } from "./select-filter.ts";

/**
 * Categories are free text, so the icon is picked from the name (Italian and English), first match wins.
 * Short words need both edges (`bar`, `gas`); longer stems match the start of any word.
 */
const themes: [IconName, RegExp][] = [
  ["groceries", /\b(spesa|supermerc|grocer|alimentar|mercato)/],
  ["coffee", /\b(caff|cafe|coffee|colazion)|\bbar\b/],
  ["dining", /\b(ristor|dining|pizz|restaurant|cena|pranz|takeaway|delivery|aperitiv)/],
  ["fuel", /\b(carburant|benzin|fuel|gasolio|diesel)/],
  ["transport", /\b(trasport|transport|trenin?|train|metro|taxi|uber|parchegg|parking|pedagg|toll|auto|car)\b|\b(trasport|transport|autostrad|mezzi)/],
  ["electricity", /\b(luce|elettric|electric|energia|energy)/],
  ["water", /\b(acqua|water|idric)/],
  ["phone", /\b(telefon|phone|mobile|internet|fibra|wifi|connession)/],
  ["bills", /\b(bollett|bills?|utenz|utilit)|\bgas\b/],
  ["home", /\b(casa|affitt|mutuo|rent|mortgage|home|condomin|manutenz|housing|mobili|arredament)/],
  ["shopping", /\b(acquist|shopping|abbigliament|cloth|vestit|scarpe|shoes)/],
  ["health", /\b(salute|health|medic|farmac|pharm|dentist|sanit|doctor|medico|ospedal|visite)/],
  ["fitness", /\b(palestr|gym|sport|fitness)/],
  ["leisure", /\b(tempo libero|leisure|svago|cinema|giochi|games?|hobby|entertain|intratten|music|concert|teatro|uscite)/],
  ["travel", /\b(viagg|travel|vacanz|holiday|hotel|volo|voli|flight|trip)/],
  ["education", /\b(scuola|school|istruzion|educat|universit|corsi|course|libri|books|formazion|tuition)/],
  ["gift", /\b(regal|gift|donazion|donation|charity|benefic)/],
  ["pet", /\b(animal|pets?|veterin|cane|gatto|dog|cat)\b|\b(animal|veterin)/],
  ["insurance", /\b(assicur|insurance)/],
  ["tax", /\b(tasse|tax|imposte|irpef|imu|tari|bollo)/],
  ["subscription", /\b(abbonament|subscription|netflix|spotify|streaming)/],
  ["savings", /\b(risparm|saving|accantonament|investiment|invest)/],
  ["income", /\b(stipend|salar|wage|paga|pension|freelance|fattur)/],
  ["deposit", /\b(altre entrate|other income|entrate|income|rimbors|refund|interess|interest|dividend|bonus)/],
];

/** Picks the icon for a category; unknown names get a generic tag (or the income arrow for income categories). */
export function categoryIcon(name: string, kind: "EXPENSE" | "INCOME"): IconName {
  const text = fold(name);
  return themes.find(([, pattern]) => pattern.test(text))?.[0] ?? (kind === "INCOME" ? "deposit" : "tag");
}
