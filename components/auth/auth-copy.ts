import type { Locale } from "@/server/demo-dashboard";

const en = {
  language: "Language",
  signInTitle: "Sign in",
  signInIntro: "Use your email and password to open your overview.",
  email: "Email",
  password: "Password",
  signIn: "Sign in",
  signingIn: "Signing in…",
  mfaTitle: "Verification code",
  mfaIntro: "Enter the six-digit code from your authenticator app.",
  code: "Six-digit code",
  codeHint: "Digits only. The code changes every 30 seconds.",
  verify: "Verify",
  verifying: "Verifying…",
  enrollTitle: "Set up two-step verification",
  enrollIntro: "Add Stead to an authenticator app once. After that, you only enter a six-digit code.",
  enrollSteps: [
    "Open your authenticator app and choose to add an account manually.",
    "Enter the setup key below. Pick the time-based option if the app asks.",
    "Type the six-digit code the app shows for Stead.",
  ],
  setupKey: "Setup key",
  setupKeyNote: "Keep this key private. Anyone with it can generate your codes.",
  copy: "Copy key",
  copied: "Key copied",
  copyFailed: "Copy failed. Select the key and copy it manually.",
  backToSignIn: "Back to sign in",
  signInAgain: "Sign in again",
  signOut: "Sign out",
  signingOut: "Signing out…",
  unavailableTitle: "Stead is unavailable",
  unavailableBody: "We can't reach the service right now. Try again in a moment.",
  retry: "Try again",
  errors: {
    invalidLogin: "Enter a valid email and password.",
    badLogin: "Email or password is incorrect.",
    invalidCode: "Enter the six digits from your authenticator app.",
    badCode: "That code didn't work. Check your app and try again.",
    expired: "Your sign-in session expired. Sign in again to continue.",
    rateLimited: "Too many attempts. Try again in a few minutes.",
    forbidden: "This request was blocked. Reload the page and try again.",
    unavailable: "Something went wrong on our side. Try again in a moment.",
  },
};

export const authCopy: Record<Locale, typeof en> = {
  en,
  it: {
    language: "Lingua",
    signInTitle: "Accedi",
    signInIntro: "Usa email e password per aprire la tua panoramica.",
    email: "Email",
    password: "Password",
    signIn: "Accedi",
    signingIn: "Accesso in corso…",
    mfaTitle: "Codice di verifica",
    mfaIntro: "Inserisci il codice a sei cifre della tua app di autenticazione.",
    code: "Codice a sei cifre",
    codeHint: "Solo cifre. Il codice cambia ogni 30 secondi.",
    verify: "Verifica",
    verifying: "Verifica in corso…",
    enrollTitle: "Attiva la verifica in due passaggi",
    enrollIntro: "Aggiungi Stead a un'app di autenticazione una sola volta. Poi ti basterà un codice a sei cifre.",
    enrollSteps: [
      "Apri la tua app di autenticazione e scegli di aggiungere un account manualmente.",
      "Inserisci la chiave qui sotto. Scegli l'opzione basata sul tempo, se l'app lo chiede.",
      "Scrivi il codice a sei cifre che l'app mostra per Stead.",
    ],
    setupKey: "Chiave di configurazione",
    setupKeyNote: "Tienila riservata. Chiunque la abbia può generare i tuoi codici.",
    copy: "Copia chiave",
    copied: "Chiave copiata",
    copyFailed: "Copia non riuscita. Seleziona la chiave e copiala a mano.",
    backToSignIn: "Torna al login",
    signInAgain: "Accedi di nuovo",
    signOut: "Esci",
    signingOut: "Uscita…",
    unavailableTitle: "Stead non è disponibile",
    unavailableBody: "Al momento non riusciamo a raggiungere il servizio. Riprova tra poco.",
    retry: "Riprova",
    errors: {
      invalidLogin: "Inserisci un'email e una password valide.",
      badLogin: "Email o password non corrette.",
      invalidCode: "Inserisci le sei cifre della tua app di autenticazione.",
      badCode: "Codice non valido. Controlla l'app e riprova.",
      expired: "La sessione di accesso è scaduta. Accedi di nuovo per continuare.",
      rateLimited: "Troppi tentativi. Riprova tra qualche minuto.",
      forbidden: "Richiesta bloccata. Ricarica la pagina e riprova.",
      unavailable: "Qualcosa è andato storto da parte nostra. Riprova tra poco.",
    },
  },
};

export type AuthErrorKey = keyof typeof en.errors;

/** Maps an auth API status code to a generic, non-enumerating message key. */
export function errorKeyForStatus(status: number, kind: "login" | "mfa"): AuthErrorKey {
  switch (status) {
    case 400: return kind === "login" ? "invalidLogin" : "invalidCode";
    case 401: return kind === "login" ? "badLogin" : "badCode";
    case 410: return "expired";
    case 429: return "rateLimited";
    case 403: return "forbidden";
    default: return "unavailable";
  }
}

/** Sends a JSON POST and resolves with the HTTP status; network failures count as 503. No response body is read. */
export async function postAuth(path: string, body?: Record<string, string>): Promise<number> {
  try {
    const response = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    return response.status;
  } catch {
    return 503;
  }
}
