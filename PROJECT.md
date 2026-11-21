# Project brief â€“ getstead

Nov 18, 2026Â 

## Idea at a glance

A web app that brings a person's cash flow, budget, investments, net worth and home (utility bills, subscriptions, property and condominium) together in one place. It starts as a tool for my own use, but is designed from day one to open up to other users and become a source of income.

Name: getstead, from "stand you in good stead" (to be useful when it matters). 

## Language and localization

The application is developed in English as its primary language, with Italian as its secondary language. Source code, identifiers, comments, and technical documentation are written in English.

## Problem, goals and target users

A person's money is spread across accounts, cards, brokers and different tools, and there is no single view of what comes in, what goes out and what their wealth is worth.

Goals, in order of priority:

1. Manage my own money better.
2. Turn it into a source of income.
3. Learn a modern stack and strengthen my portfolio.

Target: in phase 1 I am the only user. In phase 2, other private individuals, with a profile still to be defined.

Open question: what will this app do better than the tools that already exist? The answer decides whether and how it can generate income.

## Decision principles

When the three goals clash, the winner is whatever gets me using the app sooner, with real data.

- **Personal use first.** No "product" features (payments, onboarding, marketing) until I have used v1 for at least 2 months. Exception, 2026-11-21: the owner asked for a public home page with a waitlist (`/en`, `/it`); it is static, and the waitlist only collects emails.
- **Multi-user and security from day one.** Every record belongs to a user and sensitive data is encrypted. Cheap now, essential for income later.
- **Stack locked in now.** Full-stack Next.js in TypeScript, with no technology switches halfway through: learning is the third priority.
- **Interchangeable data sources.** Manual entry and CSV today, a bank aggregator tomorrow, with the same internal format.

## Scope

v1 covers four modules with manual entry and CSV import. Anything automated or commercial stays out.

**In (v1):**

- Cash flow and budget
- Net worth
- Investments
- Home and property: utility bills, subscriptions, property and condominium status
- Manual entry and CSV/Excel import
- Multi-user architecture in place, with secure login
- Browser-based, readable on smartphones too

**Out (for now):**

- Goals and projections
- Automatic connection to banks and brokers (open banking)
- Automatic bill reading (OCR) and links to utility providers' portals
- Native mobile app
- Subscriptions and payments
- Investment advice: the app tracks, it does not recommend

## Core features

All modules sit on a single foundation: users, accounts and transactions. Net worth comes almost for free once accounts and investments exist.


| Module               | v1 features                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foundation           | Sign-up and login with 2FA; account types: checking, card, brokerage, crypto, cash, debt (mortgage, loan)                                                                                                                                                                                                                                                                                                                     |
| Cash flow and budget | Categorised transactions; CSV/Excel import; automatic categorisation rules; recurring expenses; monthly budget per category with variances                                                                                                                                                                                                                                                                                    |
| Net worth            | Assets minus liabilities; monthly snapshot; trend chart                                                                                                                                                                                                                                                                                                                                                                       |
| Investments          | Buys, sells, dividends and coupons; average cost; current value (prices entered manually in v1); allocation; indicative capital gains and losses at 26%, or 12.5% for Italian government bonds                                                                                                                                                                                                                                |
| Home and property    | Utility bills (electricity, gas, water, internet, waste) with provider, due dates, amounts and consumption history; subscriptions with renewal date, annual cost and cancellation; properties with estimated value, linked mortgage and any rental income; condominium with regular instalments, balancing payments, approved extraordinary works and due dates; attachments (bill PDFs, meeting minutes); due-date reminders |


Home and property doesn't duplicate data: bills, subscriptions and condominium instalments create transactions in cash flow, and property values feed into net worth.

Tax calculations are indicative: they don't replace the broker's statement or an accountant.

## Architecture and resources

A single Next.js app in TypeScript, frontend and backend together, hosted on Vercel. Server-side logic is needed from day one: authentication, calculations and data can't live in the browser.


| Component            | Choice                                                                                              | Why                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Frontend and backend | Full-stack Next.js (App Router) in TypeScript                                                       | One language, with types shared between UI and API                       |
| Business logic       | server/ folder kept separate from the UI; REST API via route handlers                               | Rules and calculations in one place, reusable by a future mobile app     |
| Database             | PostgreSQL with Prisma ORM                                                                         | Versioned migrations and typed data access                               |
| Amounts              | Integers in cents or a decimal library, never floating-point numbers                                | No rounding errors on money                                              |
| Authentication       | Next.js authentication library, session in an httpOnly cookie, 2FA                                  | A single point decides who sees which data                               |
| Data import          | TypeScript modules behind a common interface (CSV now, aggregator later)                            | Bank connections can be added without a rewrite                          |
| Documents            | Encrypted file storage for bills and meeting minutes                                                | Attachments contain personal data and addresses                          |
| Reminders            | Vercel Cron calling a protected route, email notifications                                          | Bills, renewals and condominium instalments never catch me off guard     |
| Working with agents  | directives/ (SOPs in Markdown) and execution/ (Python scripts)                                      | Claude Code follows written procedures and runs repeatable scripts       |
| Security             | HTTPS, encryption of sensitive fields, backups; .env and .tmp/ excluded from Git                    | Financial data: a minimum baseline even for personal use                 |
| Code                 | GitHub repository, built with Claude Code and Codex                                                 | Code protection and speed                                                |
| Hosting              | Vercel: Hobby plan during personal use, Pro once the app generates income; database in an EU region | Next.js is native on Vercel; the Hobby plan doesn't allow commercial use |


Repository structure:

```text
project-root/
â”œâ”€â”€ app/                 # Next.js App Router: pages and route handlers (API)
â”œâ”€â”€ components/          # React components
â”œâ”€â”€ server/              # Business logic, database access, import
â”œâ”€â”€ db/                  # Schema and migrations
â”œâ”€â”€ public/              # Static assets
â”œâ”€â”€ directives/          # SOPs in Markdown
â”œâ”€â”€ execution/           # Python utility scripts for agents
â”œâ”€â”€ .tmp/                # Intermediate files, excluded from Git
â”œâ”€â”€ .env                 # Never committed
â”œâ”€â”€ package.json
â”œâ”€â”€ LICENSE              # Proprietary notice (see License)
â””â”€â”€ brand-guidelines.md  # (optional) Fonts and colours
```

UI components never access the database directly: they always go through server/.

Time available: 5â€“10 hours per week.

## License and protection

Decision: a private repository with a proprietary copyright notice (all rights reserved). If the repository ever goes public, it switches to the FSL (Functional Source License).

- A license can't protect an idea: copyright covers the code, not the concept. Execution and differentiation are what count.
- While the repository is private, a LICENSE file with an "all rights reserved" notice is enough: nobody may use, copy or distribute the code.
- If it goes public, the FSL lets anyone read the code and use it for themselves, but not build a competing product. Each version becomes Apache 2.0 or MIT after two years.
- Ruled out: a public repository with no license (anyone can see and copy it in practice), and MIT or Apache now (anyone could resell getstead).
- Employment check: review my employment contract for intellectual property clauses on personal projects before generating any income.
- Before opening to other users: legal review of license, terms of use and GDPR.

LICENSE file for now:

```text
Copyright (c) 2026 Yintong Zhou. All rights reserved.

This software and its source code are proprietary and confidential.
No part of it may be copied, modified, distributed or used
without the prior written permission of the copyright holder.
```

## Timeline and milestones

With 5â€“10 hours a week, the complete v1 takes about 6 months: modules arrive one at a time, not all at once.

[embed: node/99433a75-a448]

From February 2027 I already use the app for cash flow and budget while building the rest. Dates are estimates: I update them at the end of each milestone.

M5 admin (added 2026-11-21) adds an admin area: user metadata overview, user creation, password reset with temporary passwords, account disable and enable, and a 30-day log of server errors and security events. It never shows financial data. Support tickets are not included: support stays by email.

## Risks and next action

The main risk is the project growing before it reaches a version I actually use.


| Risk                                                  | How I handle it                                                                  |
| ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| Scope creep from chasing three goals                  | Decision principles; one module at a time                                        |
| New stack (TypeScript) compared with my C# background | Claude Code and SOPs in directives/; if M0 runs past 4 weeks, I revise the dates |
| Data entry becomes tedious and I abandon the app      | CSV import and categorisation rules already in M1                                |
| Security and GDPR when opening to others              | Encryption from day one; database in an EU region; legal review before the beta  |
| Crowded market                                        | Define differentiation before opening up                                         |
| Investment prices                                     | Manual in v1; automatic source to evaluate (API costs and licensing)             |
| IP clauses in my employment contract                  | Check the contract before generating income                                      |


**Next action (within 48 hours):** export the last 3 months of transactions from my main bank as CSV. That file defines the import format and the transaction data model.
