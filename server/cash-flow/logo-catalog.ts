export type LogoProvider = {
  id: string;
  name: string;
  group: "bank" | "broker" | "card" | "crypto";
  aliases: readonly string[];
  asset: string;
};

// Asset URLs document the provider website or the publisher's app icon used for each bundled thumbnail.
export const logoCatalog: readonly LogoProvider[] = [
  {
    id: "mediolanum", name: "Banca Mediolanum", group: "bank", aliases: ["mediolanum", "selfyconto", "selfy conto"],
    asset: "https://www.bancamediolanum.it/static-assets/images/apple-touch-icon.png",
  },
  {
    id: "sella", name: "Banca Sella", group: "bank", aliases: ["sella"],
    asset: "https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/a0/10/cf/a010cf58-5529-f0c9-3089-066c94644d38/Placeholder.mill/200x200Icon.ApSiOS01-75.webp",
  },
  {
    id: "widiba", name: "Banca Widiba", group: "bank", aliases: ["widiba"],
    asset: "https://www.widiba.it/sf-renderer-resources/icons/favicon-48x48.png",
  },
  {
    id: "banco-bpm", name: "Banco BPM", group: "bank", aliases: [],
    asset: "https://www.bancobpm.it/static/images/apple-touch-icon-144x144.png",
  },
  {
    id: "bancoposta", name: "BancoPosta", group: "bank", aliases: ["banco posta", "poste italiane"],
    asset: "https://www.poste.it/assets-custom/favicons/apple-touch-icon-144x144.png",
  },
  {
    id: "bbva", name: "BBVA", group: "bank", aliases: [],
    asset: "https://www.bbva.it/content/dam/library/favicons/android-chrome-192x192.png",
  },
  {
    id: "bnl", name: "BNL", group: "bank", aliases: [],
    asset: "https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/e4/13/d6/e413d6ee-5e9f-2fbf-5b7e-beefceda74d9/Placeholder.mill/200x200Icon.ApSiOS01-75.webp",
  },
  {
    id: "bper", name: "BPER Banca", group: "bank", aliases: ["bper"],
    asset: "https://www.bper.it/o/bper-2026-theme/images/apple-touch-icon.png",
  },
  {
    id: "bunq", name: "bunq", group: "bank", aliases: [],
    asset: "https://framerusercontent.com/images/ziGDZruFQDclo0tQlc6TKONVk.png",
  },
  {
    id: "credem", name: "Credem", group: "bank", aliases: ["credito emiliano"],
    asset: "https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/41/72/7b/41727b72-f21d-bf5c-6958-c81fdd75779d/Placeholder.mill/200x200Icon.ApSiOS01-75.webp",
  },
  {
    id: "credit-agricole", name: "Crédit Agricole Italia", group: "bank", aliases: ["credit agricole", "cariparma"],
    asset: "https://www.credit-agricole.it/favicons/apple-touch-icon.png",
  },
  {
    id: "fineco", name: "Fineco", group: "bank", aliases: ["finecobank", "fineco bank"],
    asset: "https://images.finecobank.com/common-global/img/icon/favicon-96x96.png",
  },
  {
    id: "hype", name: "HYPE", group: "bank", aliases: [],
    asset: "https://www.hype.it/apple-touch-icon.png",
  },
  {
    id: "illimity", name: "illimity", group: "bank", aliases: [],
    asset: "https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/9b/be/e1/9bbee199-ff56-ab97-2418-c00807a144e5/Placeholder.mill/200x200Icon.ApSiOS01-75.webp",
  },
  {
    id: "ing", name: "ING", group: "bank", aliases: ["conto corrente arancio"],
    asset: "https://www.ing.it/includes/v2020/icons/apple-touch-icon.png",
  },
  {
    id: "intesa-sanpaolo", name: "Intesa Sanpaolo", group: "bank", aliases: ["intesa"],
    asset: "https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/30/25/60/30256082-147e-4587-c686-3d74832334f0/Placeholder.mill/200x200Icon.ApSiOS01-75.webp",
  },
  {
    id: "isybank", name: "isybank", group: "bank", aliases: ["isy bank"],
    asset: "https://www.isybank.com/content/dam/isybank/images/OCAP0/V1/isybank.png",
  },
  {
    id: "mps", name: "Monte dei Paschi di Siena", group: "bank", aliases: ["mps", "monte dei paschi", "montepaschi"],
    asset: "https://www.mps.it/includes/icons/apple-touch-icon.png",
  },
  {
    id: "n26", name: "N26", group: "bank", aliases: ["n 26"],
    asset: "https://images.ctfassets.net/q33z48p65a6w/4wLQJbPhbGw4W8IeUKEiCg/5f6a3bbbf6a74de7e73882ec45531d89/1901_N26_App_Icon.png?fm=png&w=256",
  },
  {
    id: "revolut", name: "Revolut", group: "bank", aliases: [],
    asset: "https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/22/d8/92/22d8928b-9902-e965-f956-8694da5d5363/Placeholder.mill/200x200Icon.ApSiOS01-75.webp",
  },
  {
    id: "unicredit", name: "UniCredit", group: "bank", aliases: ["uni credit"],
    asset: "https://content.ucgstatic.eu/etc/designs/ucpublic/it/img/favicon/apple-touch-icon-180x180.png",
  },
  {
    id: "wise", name: "Wise", group: "bank", aliases: ["transferwise"],
    asset: "https://wise.com/public-resources/assets/icons/wise-personal/apple_touch_icon.png",
  },
  {
    id: "degiro", name: "DEGIRO", group: "broker", aliases: ["de giro", "flatexdegiro"],
    asset: "https://www.degiro.it/apple-touch-icon.png?6",
  },
  {
    id: "directa", name: "Directa", group: "broker", aliases: [],
    asset: "https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/3f/19/4c/3f194c0a-e0d8-a2ac-6b07-9cc04534a1b5/Placeholder.mill/200x200Icon.ApSiOS01-75.webp",
  },
  {
    id: "etoro", name: "eToro", group: "broker", aliases: [],
    asset: "https://www.etoro.com/wp-content/uploads/favicons/apple-touch-icon.png",
  },
  {
    id: "interactive-brokers", name: "Interactive Brokers", group: "broker", aliases: ["ibkr"],
    asset: "https://www.interactivebrokers.ie/images/web/favicons/apple-touch-icon-144x144.png",
  },
  {
    id: "saxo", name: "Saxo", group: "broker", aliases: ["saxo bank", "bgsaxo", "bg saxo"],
    asset: "https://www.home.saxo/-/media/meta/beinvested-2023/apple-touch-icon.png",
  },
  {
    id: "scalable-capital", name: "Scalable Capital", group: "broker", aliases: ["scalable"],
    asset: "https://it.scalable.capital/apple-icon.png?apple-icon.1vj-6g1ntsmpi.png",
  },
  {
    id: "trade-republic", name: "Trade Republic", group: "broker", aliases: ["traderepublic"],
    asset: "https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/d0/8b/b2/d08bb202-df79-c3f5-e8fc-ffb3a442c5c7/Placeholder.mill/200x200Icon.ApSiOS01-75.webp",
  },
  {
    id: "trading-212", name: "Trading 212", group: "broker", aliases: ["trading212"],
    asset: "https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/98/0d/02/980d02a7-7fa5-0d7e-0789-459a16b7d356/Placeholder.mill/200x200Icon.ApSiOS01-75.webp",
  },
  {
    id: "xtb", name: "XTB", group: "broker", aliases: [],
    asset: "https://xas-cdn.xtb.com/build/twigImages/icons/apple-icon-180x180.png",
  },
  {
    id: "american-express", name: "American Express", group: "card", aliases: ["amex"],
    asset: "https://www.americanexpress.com/apple-touch-icon.png",
  },
  {
    id: "nexi", name: "Nexi", group: "card", aliases: [],
    asset: "https://www.nexi.it/etc.clientlibs/nexinew/clientlibs/clientlib-site/resources/favicons/favicon.png",
  },
  {
    id: "paypal", name: "PayPal", group: "card", aliases: [],
    asset: "https://www.paypalobjects.com/webstatic/icon/pp196.png",
  },
  {
    id: "bitpanda", name: "Bitpanda", group: "crypto", aliases: [],
    asset: "https://www.bitpanda.com/favicons/apple-touch-icon-image.png",
  },
  {
    id: "coinbase", name: "Coinbase", group: "crypto", aliases: [],
    asset: "https://www.coinbase.com/apple-touch-icon.png",
  },
  {
    id: "kraken", name: "Kraken", group: "crypto", aliases: [],
    asset: "https://www.kraken.com/apple-touch-icon.png",
  },
];

function normalizeName(name: string) {
  return name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function findCatalogLogo(name: string) {
  const words = ` ${normalizeName(name)} `;
  const matches = logoCatalog.filter((provider) =>
    [provider.name, ...provider.aliases].some((alias) => words.includes(` ${normalizeName(alias)} `)));
  return matches.length === 1 ? matches[0] : null;
}

export type LogoGroup = LogoProvider["group"];

/** Catalog groups offered in the picker for each account type; an empty list means upload or link only. */
export const logoGroupsByType: Record<string, readonly LogoGroup[]> = {
  CHECKING: ["bank"],
  CARD: ["card", "bank"],
  BROKERAGE: ["broker"],
  CRYPTO: ["crypto"],
  DEBT: ["bank"],
  CASH: [],
};

export const catalogLogoPath = (id: string) => `/account-logos/${id}.webp`;
