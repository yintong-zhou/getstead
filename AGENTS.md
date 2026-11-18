# Agent Instructions

## How you work: 3 layers

LLMs are probabilistic, while money logic must be deterministic. At 90% accuracy per step, a 5-step task succeeds only 59% of the time, so push repeatable work into tested code and keep your own role to decisions.

1. **Directives (what to do):** Markdown SOPs in `directives/`. Each states the goal, inputs, scripts to use, outputs and edge cases.
2. **Orchestration (decisions):** your job. Read the relevant directive, run the right tools in order, handle errors, ask when something is ambiguous.
3. **Execution (doing the work):** deterministic, commented Python scripts in `execution/` for repo chores such as data conversion, synthetic data generation, migration checks and bulk file operations. Secrets come from `.env`.

Before a multi-step chore, check `directives/` for an SOP. Before writing a new script, check `execution/` for one that already does the job.

These layers describe how you work on the project. The product itself is the Next.js app: its business logic lives in `server/` in TypeScript, never in `execution/` scripts.

## When something breaks

1. Read the error and stack trace, fix the cause, re-run until it passes.
2. If the fix would spend paid credits or tokens, ask first.
3. Record what you learned (API limits, edge cases, timing) in the relevant directive.

Directives are living documents: improve them as you learn, but ask before creating a new directive or rewriting an existing one, because they are the project's instruction set.

## Language and localization

- Write all source code, code comments, identifiers, technical documentation, and agent instructions in English.
- English is the application's primary language. Italian is the secondary language.

## Stack

- Next.js (App Router) as a fullstack app: TypeScript in strict mode, React, Tailwind CSS.
- Business logic, data access and imports in `server/`. UI components never query the database directly.
- REST API through route handlers in `app/api/`.
- Database: Oracle or PostgreSQL, not decided yet. Ask before choosing, because the ORM depends on it.
- Authentication: library not decided yet. Requirements: httpOnly cookie sessions and 2FA.
- Hosting: Vercel. Database in an EU region (GDPR).
- Python 3 only for `execution/` scripts.
- If `brand-guidelines.md` exists in the root, use its fonts and colors.

## Repository layout

```
project-root/
â”œâ”€â”€ app/                 # Next.js App Router: pages and route handlers (API)
â”œâ”€â”€ components/          # React components
â”œâ”€â”€ server/              # Business logic, data access, imports
â”œâ”€â”€ db/                  # Schema and migrations
â”œâ”€â”€ public/              # Static assets
â”œâ”€â”€ directives/          # SOPs in Markdown
â”œâ”€â”€ execution/           # Python utility scripts
â”œâ”€â”€ .tmp/                # Intermediate files, never committed
â”œâ”€â”€ .env                 # Secrets, never committed
â”œâ”€â”€ package.json
â””â”€â”€ brand-guidelines.md  # (optional) Fonts and colors
```

## Verification

Set up these npm scripts in milestone M0. Run them before declaring any task done, and report a failure instead of claiming success:

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

## Money and data rules

These protect correctness and the owner's real financial data.

- Store and compute amounts as integer cents or with a decimal library, never as floating point: in JavaScript 0.1 + 0.2 is not 0.3.
- Every row of user data belongs to a user. Scope every query by the authenticated user's ID; a missing filter is a data leak between users.
- Encrypt sensitive fields (IBANs, account numbers, attached documents) at rest.
- Use synthetic data in tests, fixtures, seeds and examples. Real bank or broker exports stay in `.tmp/` and never reach a commit, a log or a test.
- Keep `.env`, credentials and `.tmp/` in `.gitignore`.
- Never write amounts, balances, account identifiers or personal data to logs.
- Tax figures (26% on capital gains, 12.5% on government bonds) are indicative estimates: label them as such in the UI.

## Scope (v1)

In: cash flow and budget, net worth, investments, home and property (bills, subscriptions, properties, condominium); manual entry and CSV/Excel import; multi-user-ready architecture; responsive browser UI.

Out for now: goals and projections, automatic bank or broker connection (open banking), bill OCR, native mobile app, billing for the product, investment advice (the app tracks, it never recommends).

Build milestones in order: M0 foundations, M1 cash flow and budget, M2 net worth, M3 investments, M4 home and property. If a request falls outside v1 scope, say so and ask before building it.

## Autonomy

Without asking: read anything in the repo, edit code within the current task, add tests, run the verification commands, create local migrations, run `execution/` scripts on local or synthetic data.

Ask first: adding a dependency, running migrations against any non-local database, deploying, pushing to `main`, deleting files outside `.tmp/` or any user data, calling paid APIs, creating or rewriting directives.

## Files

- `.tmp/` holds intermediate files (parsed CSVs, temporary exports). Everything there can be deleted and regenerated.
- The deliverables are the code in this repository and the running app.

