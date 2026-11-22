---
type: handoff
date: 2026-11-22
status: Changes are in the working tree on main, not committed. Lint, typecheck, build and 132 unit tests pass. Signed-in pages were not checked in a browser.
seq: 1
prev: null
tags: [getstead, ui, charts, bklit, motion, cleanup]
---

# UI polish, Bklit charts and Motion

## Goal

Remove the visual habits that make an interface look machine-generated, replace the hand-built charts with Bklit UI, add Motion for transitions, then delete what the change left unused. The brand stays: Liquid Glass, Plus Jakarta Sans, brand blue and the logo.

## Where we are

- The code contained no AI wording (no "AI-powered", sparkles or bot icons), so the polish targeted visual tells instead.
- Polish done: one brand-blue wash behind the glass instead of four hues, neutral shadows, sentence-case overlines at 12 px, weight 750 replaced by 700, off-grid spacing (6, 10, 14, 18 px) snapped to the 4 px scale, one easing curve (`--ease`), no overshoot toggle and no hover lift on cards that are not clickable, trailing periods removed from the landing step titles and the waitlist confirmation.
- Charts: the cash flow bars, the net worth and investments trend, and the allocation donut use Bklit UI. The landing overview preview reuses the cash flow chart. Budget `<progress>` bars are unchanged.
- Motion: `components/motion-provider.tsx` (reduced motion honoured), `lib/motion.ts` (tokens) and `components/page-enter.tsx` (page body fades in once and rises 8 px).
- Cleanup: removed `lucide-react`, `tw-animate-css`, `@base-ui/react`, `class-variance-authority`, the `cn` package and `shadcn`; removed `components/ui/button.tsx`, 25 unreachable Bklit files and the unused shadcn variables in `app/globals.css`; removed the CSS rules of 11 classes that no file uses.
- Added `motion`, `d3-array`, `d3-scale`, `d3-shape`, `@number-flow/react`, `clsx` and `tailwind-merge`. The owner approved Motion and Bklit before the install.
- Checked in the browser: the landing chart (bars, tooltip with exact amounts, hover) in the dark theme, and the area chart and donut on a temporary page with synthetic data, since deleted.

## What we tried that did not work

- `npx shadcn add -y` still asks before overwriting `lib/utils.ts`, and without an answer it stops after installing dependencies. `-o` overwrites and completes. The overwrite also replaced a `cn` re-export from the unrelated `cn` package with the standard `clsx` + `tailwind-merge` helper.
- The area chart anchors the y axis at zero while every value is positive, so a net worth that moves 1% looked flat. A `yDomainOverrides` prop was added to `area-chart.tsx` and `trend-card.tsx` passes the series minimum and maximum with a 15% margin.
- Removing the shadcn `@layer base { * { border-color } }` rule turned the tooltip border white, because Tailwind's default is `currentColor`. A one-line replacement using `var(--border)` is back at the end of `app/globals.css`.
- Python is not installed on this machine, so file edits ran as Node scripts. Several files use CRLF line endings; the scripts keep them.

## Decisions

- Targeted polish, not a redesign. Liquid Glass, the logo gradient and the 700/800 weights are documented brand choices, so they stay. Only the overline casing, the greeting emoji and the background hues changed in `brand-guidelines.md`.
- Bklit sources are vendored in `components/charts/` and excluded from ESLint, because the upstream code fails the `react-hooks/refs` rule. Rewriting it would make every future `shadcn add` conflict.
- The landing net worth line (a scroll-driven SVG) and the allocation bar stay static. Replacing them would load chart JavaScript on a public page for no visible gain.
- No ADR directory exists in this repository; decisions live in handoffs, so these are recorded here.

## Files changed

- `components/cash-flow-chart.tsx` (new), `components/dashboard.tsx`, `components/landing/mocks.tsx`: cash flow bars.
- `components/trend-card.tsx`: area chart with a fitted y domain.
- `components/investments/investments-view.tsx`, `investments.css`: allocation donut.
- `components/charts/`, `components/shimmering-text.tsx`, `lib/utils.ts`, `components.json`: Bklit sources and registry.
- `components/motion-provider.tsx`, `components/page-enter.tsx`, `lib/motion.ts`, `app/[locale]/layout.tsx`, `components/app-shell.tsx`: Motion.
- `app/globals.css` and the per-feature stylesheets: tokens, wash, shadows, overlines, spacing, easing, removed rules.
- `components/landing/copy.ts`, `copy.test.ts`: periods removed, test added.
- `eslint.config.mjs`: ignores `components/charts/**` and `components/shimmering-text.tsx`.
- `README.md`, `PROJECT.md`, `AGENTS.md`, `brand-guidelines.md`: documentation.

## Next steps

1. Sign in locally and look at Overview, Net worth and Investments in light and dark, on a phone width and with reduced motion on. Check range switching, the percent toggle and hidden amounts on the trend card.
2. Decide whether to restore what the Bklit bars cannot do per bar: past months at 55% opacity and an outlined bar for refund months (the refund note still names them). Also the dashed capital-invested line on the investments trend.
3. Commit in two steps if wanted: the visual and chart changes, then the cleanup.
4. Optionally remove the `iconLibrary: "lucide"` line from `components.json`; the package is gone and nothing reads it.

## Before changing anything

- Use synthetic data for any chart test. Do not put real amounts or account names in fixtures or logs.
- After `npx shadcn@latest add @bklit/<name> -y -o`, check `git diff` for `lib/utils.ts` and the `--chart-*` variables appended to `app/globals.css`, then map them back to the brand palette.
