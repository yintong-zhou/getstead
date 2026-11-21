import type { Locale } from "@/server/locale";

/*
 * Waitlist privacy notice. It states only what the code does. The owner confirms the wording and the
 * contact address (PRIVACY_CONTACT_EMAIL) before the waitlist goes live.
 */
const en = {
  metaTitle: "Privacy notice",
  metaDescription: "What getstead keeps when you join the waitlist, why, for how long, and how to have it removed.",
  title: "Privacy notice",
  updated: "Last updated 21 November 2026",
  back: "Back to the home page",
  contact: "To see, correct or delete your email, write to",
  sections: [
    { title: "What we keep", body: "If you join the waitlist: your email address, the language of the page you used and the time you agreed. This page sets no cookies and runs no trackers. To limit abuse we also keep a scrambled version of your IP address (a keyed hash that cannot be turned back into the address) with a count of recent attempts. Our hosting provider may keep technical logs, such as IP addresses, for security." },
    { title: "Why", body: "To tell you when there is room to use getstead. We do not share the list and we do not use it for anything else." },
    { title: "Your consent", body: "You gave it by ticking the box. You can withdraw it at any time, and we will delete your email." },
    { title: "How long", body: "Until we have written to you, or until you ask us to delete it, whichever comes first." },
    { title: "Where", body: "In a database hosted in the EU." },
    { title: "Your rights", body: "You can ask to see, correct or delete your data, and you can complain to the Italian data protection authority, the Garante per la protezione dei dati personali." },
  ],
};

export type PrivacyCopy = typeof en;

const it: PrivacyCopy = {
  metaTitle: "Informativa sulla privacy",
  metaDescription: "Cosa conserva getstead quando entri in lista d'attesa, perché, per quanto tempo e come farlo cancellare.",
  title: "Informativa sulla privacy",
  updated: "Ultimo aggiornamento: 21 novembre 2026",
  back: "Torna alla home",
  contact: "Per vedere, correggere o cancellare la tua email scrivi a",
  sections: [
    { title: "Cosa conserviamo", body: "Se entri in lista d'attesa: il tuo indirizzo email, la lingua della pagina che hai usato e il momento in cui hai acconsentito. Questa pagina non imposta cookie e non usa sistemi di tracciamento. Per limitare gli abusi conserviamo anche una versione irriconoscibile del tuo indirizzo IP (un hash con chiave, da cui non si risale all'indirizzo) con il numero dei tentativi recenti. Il nostro fornitore di hosting può conservare log tecnici, come gli indirizzi IP, per motivi di sicurezza." },
    { title: "Perché", body: "Per dirti quando c'è posto per usare getstead. Non condividiamo l'elenco e non lo usiamo per altro." },
    { title: "Il tuo consenso", body: "L'hai dato spuntando la casella. Puoi ritirarlo quando vuoi e cancelleremo la tua email." },
    { title: "Per quanto tempo", body: "Fino a quando ti avremo scritto o fino a quando ci chiedi di cancellarla, a seconda di quale dei due arriva prima." },
    { title: "Dove", body: "In un database ospitato nell'UE." },
    { title: "I tuoi diritti", body: "Puoi chiedere di vedere, correggere o cancellare i tuoi dati e puoi presentare reclamo al Garante per la protezione dei dati personali." },
  ],
};

export const privacyCopy: Record<Locale, PrivacyCopy> = { en, it };
