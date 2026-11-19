import { formatEuros, isLocale, localeTags, locales, type Locale } from "./locale.ts";

// Retained synthetic data. The application no longer renders it; the locale helpers moved to ./locale.ts.
export { formatEuros, isLocale, localeTags, locales, type Locale };


const transactions = [
  { id: "groceries-market", name: { en: "Local market", it: "Mercato di quartiere" }, category: "groceries", day: 18, amountCents: -6_420 },
  { id: "transport-train", name: { en: "Train ticket", it: "Biglietto del treno" }, category: "transport", day: 17, amountCents: -3_480 },
  { id: "income-freelance", name: { en: "Freelance payment", it: "Pagamento freelance" }, category: "income", day: 15, amountCents: 68_000 },
  { id: "bills-internet", name: { en: "Internet", it: "Internet" }, category: "bills", day: 14, amountCents: -2_990 },
  { id: "dining-dinner", name: { en: "Dinner out", it: "Cena fuori" }, category: "dining", day: 12, amountCents: -4_650 },
  { id: "groceries-supermarket", name: { en: "Supermarket", it: "Supermercato" }, category: "groceries", day: 10, amountCents: -16_760 },
  { id: "dining-lunch", name: { en: "Lunch and takeaway", it: "Pranzi e asporto" }, category: "dining", day: 9, amountCents: -17_350 },
  { id: "transport-pass", name: { en: "Travel pass", it: "Abbonamento trasporti" }, category: "transport", day: 8, amountCents: -7_240 },
  { id: "shopping-household", name: { en: "Household supplies", it: "Prodotti per la casa" }, category: "shopping", day: 7, amountCents: -18_250 },
  { id: "shopping-desk", name: { en: "Home office", it: "Ufficio in casa" }, category: "shopping", day: 5, amountCents: -42_600 },
  { id: "bills-insurance", name: { en: "Insurance", it: "Assicurazione" }, category: "bills", day: 4, amountCents: -31_800 },
  { id: "income-reimbursement", name: { en: "Reimbursement", it: "Rimborso" }, category: "income", day: 3, amountCents: 29_000 },
  { id: "bills-rent", name: { en: "Rent", it: "Affitto" }, category: "bills", day: 2, amountCents: -92_000 },
  { id: "income-salary", name: { en: "Salary", it: "Stipendio" }, category: "income", day: 1, amountCents: 325_000 },
] as const;

const netWorth = [
  { month: "2026-06", cents: 10_820_000 },
  { month: "2026-07", cents: 11_140_000 },
  { month: "2026-08", cents: 11_096_000 },
  { month: "2026-09", cents: 11_638_000 },
  { month: "2026-10", cents: 12_040_000 },
  { month: "2026-11", cents: 12_458_000 },
];

const pastCashFlow = [
  { month: "2026-06", incomeCents: 364_200, expenseCents: 278_600 },
  { month: "2026-07", incomeCents: 388_700, expenseCents: 317_100 },
  { month: "2026-08", incomeCents: 351_400, expenseCents: 295_800 },
  { month: "2026-09", incomeCents: 401_000, expenseCents: 267_300 },
  { month: "2026-10", incomeCents: 392_000, expenseCents: 292_800 },
];

const budgetLimits = [
  { category: "groceries", limitCents: 42_000 },
  { category: "dining", limitCents: 24_000 },
  { category: "transport", limitCents: 18_000 },
] as const;

const bills = [
  { id: "electricity", name: { en: "Electricity", it: "Luce" }, day: 22, amountCents: 8_440 },
  { id: "water", name: { en: "Water", it: "Acqua" }, day: 25, amountCents: 4_180 },
  { id: "subscription", name: { en: "Streaming", it: "Streaming" }, day: 28, amountCents: 1_499 },
] as const;

const holdings = [
  { id: "equity", name: { en: "Global equity fund", it: "Fondo azionario globale" }, amountCents: 3_845_000 },
  { id: "bonds", name: { en: "Government bonds", it: "Titoli di Stato" }, amountCents: 2_379_000 },
] as const;

export function getDemoDashboard() {
  const incomeCents = transactions.reduce((total, item) => total + Math.max(item.amountCents, 0), 0);
  const expenseCents = transactions.reduce((total, item) => total + Math.max(-item.amountCents, 0), 0);
  const budgets = budgetLimits.map(({ category, limitCents }) => ({
    category,
    limitCents,
    spentCents: transactions.reduce(
      (total, item) => item.category === category ? total + Math.max(-item.amountCents, 0) : total,
      0,
    ),
  }));

  return {
    month: "2026-11",
    cashFlow: [...pastCashFlow, { month: "2026-11", incomeCents, expenseCents }],
    incomeCents,
    expenseCents,
    monthlyBalanceCents: incomeCents - expenseCents,
    netWorth,
    budgets,
    transactions,
    bills,
    holdings,
    investmentCents: holdings.reduce((total, item) => total + item.amountCents, 0),
  };
}
