import type { Locale } from "@/server/locale";

export const profileCopy = {
  en: {
    title: "Profile and settings", intro: "Manage your name, sign-in details and language.",
    displayName: "Display name", nameHint: "Optional, up to 60 characters. Leave blank to clear.",
    email: "Email", newEmail: "New email", currentPassword: "Current password",
    password: "Password", newPassword: "New password", confirmPassword: "Confirm new password",
    passwordHint: "Use at least 15 characters and at most 512 bytes. Your other sessions will be signed out.",
    language: "Language", save: "Save", saving: "Saving…", saved: "Changes saved.",
    passwordSaved: "Password changed. Your other sessions have been signed out.",
    signOut: "Sign out", signingOut: "Signing out…", signOutFailed: "We couldn't sign you out. Try again.",
    errors: {
      invalid: "The current password is incorrect.", limited: "Too many attempts. Try again in 15 minutes.",
      conflict: "That email is already in use.", validation: "Check the entered values and try again.",
      same_password: "Choose a password different from your current password.",
      mismatch: "The new passwords do not match.", network: "Connection lost. Try again.",
      generic: "We couldn't save your changes. Try again.",
    } as Record<string, string>,
  },
  it: {
    title: "Profilo e impostazioni", intro: "Gestisci il nome, i dati di accesso e la lingua.",
    displayName: "Nome visualizzato", nameHint: "Facoltativo, fino a 60 caratteri. Lascia vuoto per rimuoverlo.",
    email: "Email", newEmail: "Nuova email", currentPassword: "Password attuale",
    password: "Password", newPassword: "Nuova password", confirmPassword: "Conferma nuova password",
    passwordHint: "Usa almeno 15 caratteri e al massimo 512 byte. Le altre sessioni verranno disconnesse.",
    language: "Lingua", save: "Salva", saving: "Salvataggio…", saved: "Modifiche salvate.",
    passwordSaved: "Password modificata. Le altre sessioni sono state disconnesse.",
    signOut: "Esci", signingOut: "Uscita…", signOutFailed: "Non è stato possibile uscire. Riprova.",
    errors: {
      invalid: "La password attuale non è corretta.", limited: "Troppi tentativi. Riprova tra 15 minuti.",
      conflict: "Questa email è già in uso.", validation: "Controlla i valori inseriti e riprova.",
      same_password: "Scegli una password diversa da quella attuale.",
      mismatch: "Le nuove password non coincidono.", network: "Connessione interrotta. Riprova.",
      generic: "Non è stato possibile salvare le modifiche. Riprova.",
    } as Record<string, string>,
  },
} satisfies Record<Locale, unknown>;
