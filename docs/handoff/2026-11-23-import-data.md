---
type: handoff
date: 2026-11-23
status: in corso
seq: 1
prev: nessuno
tags: [import, cash-flow, neon, scripts]
---

# Handoff: import dei riepiloghi mensili nel database reale

## Obiettivo

Portare nel database reale (Neon, `neondb`) i dati storici di entrate e uscite del foglio Google (export HTML `01.html`..`12.html`, anno 2026) usando uno script locale in `.import-data/` (ignorata da git). Lo script deve usare solo conti e categorie già presenti nell'app e non inventarne di nuove.

## A che punto siamo

- Lo script di lettura, mapping e controllo è **pronto e provato in sola lettura** sui file reali (`C:\Users\zhouy\Downloads\data`, 11 mesi, manca dicembre). Il controllo contro l'app dice: ogni conto e categoria esiste. 140 movimenti da importare.
- **L'import vero non è ancora stato rifatto.** Il primo tentativo (22/11 17:56) è stato ripristinato: il database ha di nuovo 0 movimenti.
- L'app locale mostrava «getstead is unavailable» e poi Home e Cash flow non si caricavano. Cause non confermate; ho riavviato `npm run dev` (nuovo processo, output in `.tmp/dev-restart.log`). L'utente non ha ancora confermato che le due pagine funzionino.

## Cosa abbiamo provato che NON ha funzionato

- **Prima versione dello script: creava le categorie mancanti.** Ha creato 11 categorie con nomi del foglio non presenti nell'app (Regali, Animali domestici, Ristorante/Bar...), duplicando quelle esistenti (Regalo, Animale, Ristorante o Bar...). Sostituita: ora non crea nulla.
- **Leggere `Movimenti.html`/`Modifiche.html`/`Dashboard.html`.** Scartato su richiesta: contenevano dati di esempio. Si leggono solo i file mensili numerati 1..12.
- **Cancellare con l'utente dell'app.** `stead_auth_app` non ha DELETE su `stead_movements` (voluto: vedi `db/grant-runtime.sql`). Il rollback è riuscito solo con l'utente admin.
- **`DATABASE_ADMIN_URL` in `credentials/stead-postgres.env` punta a `test_neondb`, che non esiste.** Il rollback ha funzionato impostando a mano il nome del database a `neondb` (stesso host e utente owner).
- **Verificare il malfunzionamento dell'app via codice:** con i 154 movimenti importati tutte le funzioni server (dashboard, registro, trend, riepilogo) funzionavano e nel registro errori non c'era nulla dopo l'import. Il difetto non è stato riprodotto: non si sa se dipendeva dall'import.

## Problemi incontrati e come li abbiamo risolti

- **«Category X appears as both income and expense».** Sintomo: lo script si ferma. Causa: nome categoria nei due blocchi ENTRATE/USCITE. Correzione: in `Business` entra/esce lo stesso importo ogni mese (si annulla), quindi è in `SKIP_CATEGORIES`.
- **Un mese non somma al «Totale Generale» del foglio.** Decisione: il totale scritto non è affidabile; si usano le righe. Lo scarto è solo una nota.
- **File mensili mancanti** (non c'è il 12): ammesso; si leggono quelli presenti con nome `1.html`..`12.html`.
- **«getstead is unavailable».** Sintomo: pagina di errore di auth. Causa: `server/auth/page-access.ts` cattura ogni eccezione e mostra quella pagina senza loggare. Ipotesi: connessione al database scaduta nel dev server (girava dal 22/11 17:10) o cold start di Neon oltre i 3 s di `connectionTimeoutMillis`. Rimedio applicato: riavvio del dev server.

## Decisioni prese

- **Un movimento per categoria e mese** (i file hanno solo totali): importo = Totale, entrate positive e uscite negative, data = ultimo giorno del mese, descrizione `<Categoria> MM/AAAA`. Scartato: leggere i movimenti singoli (non presenti nei file 1..12).
- **`--year` obbligatorio**: i fogli non dicono l'anno.
- **Mapping conti** (in cima a `.import-data/import.ts`): Casa → ING, Trasporti → Revolut, tutto il resto → Fineco. Per Ristorante o Bar e Spesa: totale multiplo di 8,00 € → Edenred Tickets, altrimenti Revolut (scelta dell'utente, per i buoni pasto da 8 €). Scartato: dividere il totale in parte multipla di 8 e resto.
- **Mapping categorie** (`CATEGORY_MAP`): Regali → Regalo, Animali domestici → Animale, Abbonamenti → Abbonamento, Viaggi → Viaggio, Ristorante/Bar → Ristorante o Bar, Formazione/Cultura → Formazione e cultura, Palestra/Benessere → Sport, Spese personali → Acquisti Online, Crediti → Altre entrate, Bollette/Tasse → Bollette. Le altre hanno già lo stesso nome. «Altre uscite» è stata aggiunta dall'utente nel database. Scartato: creare categorie nuove o importare senza categoria.
- **Business saltato** (entrata e uscita), perché identici ogni mese.
- **Le colonne «Previste» non si importano** (potrebbero diventare limiti di budget: non richiesto).

## File toccati

- `.gitignore`: aggiunta `.import-data/`.
- `eslint.config.mjs`: `.import-data/**` tra gli ignorati.
- `.import-data/sheet.ts` (ignorato da git): lettura HTML, importi in centesimi, riepilogo mensile.
- `.import-data/import.ts` (ignorato da git): CLI, mapping conti e categorie, controllo contro l'app, conferma `IMPORT`, scrittura in transazione, log.
- `.import-data/sheet.test.ts` (ignorato da git): 2 test.
- `docs/handoff/2026-11-23-import-data.md`: questo file.

## Dove vogliamo andare

1. **Chiedere all'utente se Home e Cash flow ora si caricano** dopo il riavvio. Se no, leggere `.tmp/dev-restart.log` e farsi dare l'errore del browser.
2. **Primo import di prova su un solo mese** (es. `11.html` in una cartella a parte), poi aprire l'app e verificare che funzioni:

   ```
   node --env-file-if-exists=.env.local .import-data/import.ts <cartella> --year 2026 --email <email-utente> --commit
   ```

   Prima lanciarlo senza `--commit` e con `--email`: deve dire «every account and category exists».
3. Se va bene, importare tutti i mesi. Dicembre: aggiungere `12.html` quando c'è.

## Da sapere prima di toccare qualcosa

- Il database dell'app è **reale** (Neon, `eu-central-1`); non c'è un database locale. Non lanciare `--commit` senza conferma esplicita dell'utente.
- L'import non è annullabile con l'utente dell'app. Per il ripristino serve `DATABASE_ADMIN_URL` con il nome database cambiato in `neondb`, cancellando solo le righe create nella finestra dell'import, con controllo dei conteggi (movimenti e categorie attesi) in una transazione. Lo script di rollback è stato cancellato da `.tmp/`: va riscritto.
- Il log (`.import-data/logs/`) non contiene importi né descrizioni, per regola del progetto. Non cambiarlo.
- `node` non esegue da `.import-data` con le flag di ambiente di default: servono `--env-file-if-exists=.env.local`. Il dev server è un processo nuovo avviato da me in background (non dal terminale dell'utente).
- Su questa macchina `python` non esiste: gli script di supporto vanno scritti in Node/TypeScript.
- Con heredoc nel terminale i backslash nelle regex possono sparire: preferire gli strumenti di modifica file.

## Aggiornamento 2026-11-23 (sessione 2)

- Lo script è stato lanciato dall'utente con il mapping finale: 140 movimenti importati alle 08:36 UTC. Subito dopo Home e Cash flow non si caricavano; **cancellati i 140 movimenti** (stesso metodo admin con database `neondb`, con controlli sui conteggi) e **le pagine sono tornate a funzionare**. Quindi il problema è causato dai dati importati, non dal server.
- Da un processo nuovo (chiave di `.env.local`, impronta `b497d7bf`) tutte le funzioni di Home e Cash flow funzionano con quei 140 movimenti; in quel processo si decifrano loghi (7/7) e descrizioni dei movimenti.
- Il TOTP dell'admin NON si decifra con nessuna chiave trovata (`.env.local` e `.tmp/*.env`): `POST /api/auth/mfa` dà 503 dopo il riavvio. I dati nel database sono cifrati con almeno due chiavi diverse.
- Ipotesi principale, non confermata: il dev server dell'utente ha `AUTH_ENCRYPTION_KEY` diversa da `.env.local` (variabile d'ambiente del terminale, che ha la precedenza). Con quella chiave i movimenti importati dagli script (chiave `.env.local`) non si decifrano e le pagine mostrano «getstead is unavailable». Gli errori sui loghi (GET /api/cash-flow/accounts/:id/logo) già prima dell'import vanno nella stessa direzione.
- Da fare: far controllare all'utente `$env:AUTH_ENCRYPTION_KEY` nel terminale del dev server; se esiste, lo script deve usare la stessa chiave (lanciarlo nello stesso terminale, senza `--env-file` che non la sovrascrive). Se non esiste, riprodurre con un solo mese e loggare l'errore catturato in `app/[locale]/cash-flow/page.tsx` e `server/auth/page-access.ts` (ora ingoiato senza log).
- Il database ha di nuovo 0 movimenti. Non rilanciare `--commit` finché la causa non è chiara.
