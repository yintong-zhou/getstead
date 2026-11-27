import type { Locale } from "@/server/locale";

// Strings owned by the Movements screens (preview page and history). Shared copy stays in copy.ts.
const en = {
  rememberLabel: "Phrase to remember",
  newCategoryOption: "+ New category",
  newCategoryTitle: "New category",
  newCategoryName: "Category name",
  newCategoryType: "Type",
  newCategoryCreate: "Create category",
  newCategoryCreated: "Category added and selected.",

  moreActions: "More actions",
  moreActionsFor: (description: string) => `More actions for ${description}`,
  viewAll: "View all",
  viewAllFor: (title: string) => `View all: ${title}`,
  previewThree: "Show 3",
  previewFive: "Show 5",
  recentIncome: "Recent income",
  recentExpenses: "Recent expenses",
  recentTransfers: "Recent transfers",

  historyTitle: "Movement history",
  historyIntro: "Every movement, with filters and pages.",
  backToCashFlow: "Back to cash flow",
  type: "Type",
  allTypes: "All movements",
  typeIn: "Income",
  typeOut: "Expenses",
  typeTransfers: "Transfers",
  allPeriods: "All periods",
  byMonth: "Pick a month",
  period: "Period",
  historyTotal: "Net total",
  historyPageSize: "Movements per page",
  historyEmpty: "No movements match these filters.",
  resetFilters: "Reset filters",
};

export type MovementsCopy = typeof en;

export const movementsCopy: Record<Locale, MovementsCopy> = {
  en,
  it: {
    rememberLabel: "Frase da ricordare",
    newCategoryOption: "+ Nuova categoria",
    newCategoryTitle: "Nuova categoria",
    newCategoryName: "Nome della categoria",
    newCategoryType: "Tipo",
    newCategoryCreate: "Crea categoria",
    newCategoryCreated: "Categoria aggiunta e selezionata.",

    moreActions: "Altre azioni",
    moreActionsFor: (description: string) => `Altre azioni per ${description}`,
    viewAll: "Vedi tutti",
    viewAllFor: (title: string) => `Vedi tutti: ${title}`,
    previewThree: "Mostra 3",
    previewFive: "Mostra 5",
    recentIncome: "Entrate recenti",
    recentExpenses: "Uscite recenti",
    recentTransfers: "Giroconti recenti",

    historyTitle: "Storico movimenti",
    historyIntro: "Tutti i movimenti, con filtri e pagine.",
    backToCashFlow: "Torna ai flussi di cassa",
    type: "Tipo",
    allTypes: "Tutti i movimenti",
    typeIn: "Entrate",
    typeOut: "Uscite",
    typeTransfers: "Giroconti",
    allPeriods: "Tutti i periodi",
    byMonth: "Scegli un mese",
    period: "Periodo",
    historyTotal: "Totale netto",
    historyPageSize: "Movimenti per pagina",
    historyEmpty: "Nessun movimento corrisponde a questi filtri.",
    resetFilters: "Azzera i filtri",
  },
};
