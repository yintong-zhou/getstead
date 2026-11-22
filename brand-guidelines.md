# Brand Guidelines v0.1

Nov 18, 2026

This is the first version of the brand guidelines, derived from the UI draft in Figma (mobile Dashboard and Cash Flow & Budget, desktop Dashboard). It keeps upcoming screens consistent and, later on, the website and launch materials.

## Brand essence

Bilancio brings all of a person's money into one place: cash flow, budget, investments, net worth and home. The promise is simple: **always know where you stand, effortlessly**.

- **Mission:** give anyone a clear, complete view of their finances, so they decide calmly rather than anxiously.
- **Who it's for:** adults who run a household and hold some investments, today scattered across banking apps, Excel sheets and PDF bills.
- **What sets us apart:** the Home section (utility bills, subscriptions, condominium, property) alongside budget and investments. Few apps offer them together.

**Values**

1. **Clarity** — the number that matters first, then the detail.
2. **Trust** — data handled rigorously, no judgment on users' choices.
3. **Calm** — no shouting alerts: every warning proposes an action.
4. **Control** — the user decides; the app suggests.

**Free / Pro model.** The free version covers manual entry and the main views. The Pro plan adds automatic bank account sync and advanced features. The Pro invitation is discreet and useful (e.g. "Sync your bank accounts automatically"), never blocking.

## Personality and tone of voice

Bilancio speaks like a knowledgeable friend: direct, warm, never technical without reason. It addresses the user informally ("tu" in Italian), uses short sentences and action verbs. The product launches in Italian; these rules apply to every language.

- **Do:** concrete numbers, one idea per sentence, a proposed action after every alert.
- **Don't:** unexplained financial jargon, blaming, strings of exclamation marks, emoji in informational copy (allowed only in the greeting).


| Situation       | Do                                                | Don't                                            |
| --------------- | ------------------------------------------------- | ------------------------------------------------ |
| Greeting        | Hi, Yintong 👋                                    | Welcome to your financial control panel          |
| Budget exceeded | Restaurants over budget. Move funds from Leisure? | Warning!!! You spent too much!                   |
| Due date        | Electricity bill · Due Nov 22                     | Reminder: a utility-related payment is coming up |
| Investments     | Consider rebalancing \~ € 1,700                   | Your portfolio is unbalanced                     |
| Pro upsell      | Sync your bank accounts automatically             | Unlock all premium features now!                 |


**Labels and buttons:** verbs or short nouns ("New transaction", "See all", "Edit"). Three words maximum.

## Logo and name

The mark is a glass drop with two round eyes and a curled tip, in a blue-to-violet gradient with a soft highlight, so it matches the Liquid Glass style. It sits before the name in Title/M, at 36 × 36 px (the sidebar, the mobile bar and the sign-in page). It is the one multicolor shape in the product: it is a logo, not an icon, so the "no multicolor icons" rule below does not apply to it.

- **Files:** `docs/brand/getstead-mark.png` is the master (transparent, 811 × 811 px). `public/brand/getstead-mark.png` (128 px) feeds the in-app mark through `components/brand-mark.tsx`; `app/icon.png` (192 px, transparent) is the favicon and `app/apple-icon.png` (180 px, on the light page color) is the home-screen icon. The mark is a raster image; a vector version is still to be drawn.
- **Clear space:** at least a quarter of the mark's width on every side.
- **Backgrounds:** light backgrounds and glass surfaces. On the dark theme and on Brand Dark it stays transparent, with nothing behind it (the owner prefers it over a light circle).
- **Minimum size:** 24 px wide. Below that, show the name only.
- **Don't:** recolor the gradient, add shadows or outlines, distort, rotate or crop the mark, add other faces, or set the name in another typeface.

**To decide:** final name (checking domain and trademark availability) and a vector version of the mark.

## Color

The palette is restrained: light, neutral backgrounds, a confident blue as the lead color, and green and red reserved for money coming in and going out. Names match the tokens in Figma ("Tokens" collection).


| Token                | Hex                                             | Use                                                 |
| -------------------- | ----------------------------------------------- | --------------------------------------------------- |
| color/brand          | #2F5BEA                                         | Primary actions, active menu item, links            |
| color/brand-dark     | #1B2B5E                                         | Hero cards (net worth, portfolio), Pro panel        |
| color/brand-soft     | #E3EAFD                                         | Icon backgrounds, active state, informational cards |
| color/bg             | #F5F6FA                                         | Page background                                     |
| color/surface        | #FFFFFF                                         | Cards, navigation bars                              |
| color/surface-alt    | #EEF1F7                                         | Progress tracks, segmented controls                 |
| color/border         | #E2E8F0                                         | Opaque fallback and form or legacy dividers; cards have no border, and dividers use glass/hairline |
| color/text-primary   | #0F172A                                         | Titles, amounts                                     |
| color/text-secondary | #536277                                         | Labels, dates, inactive icons; AA contrast on glass |
| color/positive       | #16A34A                                         | Income, positive returns                            |
| color/positive-soft  | #DCFCE7                                         | Income element backgrounds                          |
| color/negative       | #DC2626                                         | Expenses, exceeded budget, losses                   |
| color/negative-soft  | #FEE2E2                                         | Expense element backgrounds                         |
| color/warning        | #F59E0B                                         | Alerts and upcoming due dates                       |
| color/warning-soft   | #FEF3C7                                         | Alert and bill backgrounds                          |
| color/chart-1 … 5    | #2F5BEA · #14B8A6 · #F59E0B · #A855F7 · #F43F5E | Series and categories in charts                     |
| color/on-brand       | #FFFFFF                                         | Text and icons on blue backgrounds                  |


**Rules**

- Green and red mean only income/expense or gain/loss: never decoration.
- Color never carries meaning alone: pair it with a sign (+ / −, ▲ / ▼) or a label.
- One solid Brand element per view (the primary button or the floating "+").
- "Soft" variants are backgrounds; text on them stays text-primary or the matching solid color.
- **Dark theme** (Settings → Theme: Match my device / Light / Dark). Same token names, second value; in code each is a `light-dark()` pair in `app/globals.css`. Dark values: bg #0B1020, surface #141B30, surface-alt #1C2540, border #2B3659, text-primary #E8EDF8, text-secondary #A6B4CC, brand (text, icons, outlines) #86A3FF, brand-soft #1F2B52, positive #4ADE80 (ink #6EE7A0, soft #11351F), negative #F87171 (soft #3B1A20), warning #FBBF24 (soft #3A2C0D). Solid brand fills (primary button, "+") stay #2F5BEA with white text (5.5:1), and hero cards stay brand-dark, so they read the same in both themes. All text pairs above were checked at ≥ 4.5:1.

## Typography

The whole product uses **Plus Jakarta Sans**, a modern geometric sans that stays legible even in small figures. It is free on Google Fonts; fallback: `system-ui, -apple-system, "Segoe UI", sans-serif`.


| Style          | Weight    | Size / line height | Tracking           | Use                              |
| -------------- | --------- | ------------------ | ------------------ | -------------------------------- |
| Display/Amount | ExtraBold | 32 / 38 px         | −0.5 px            | Main amount (net worth, balance) |
| Title/L        | Bold      | 22 / 28 px         | −0.3 px            | Page title, desktop KPIs         |
| Title/M        | Bold      | 17 / 24 px         | −0.2 px            | Card title, KPI amounts          |
| Body/Strong    | SemiBold  | 15 / 20 px         | 0                  | Transaction names, list amounts  |
| Body/Regular   | Medium    | 14 / 20 px         | 0                  | Body text, text actions          |
| Caption        | Medium    | 12 / 16 px         | 0                  | Dates, categories, legends       |
| Overline       | SemiBold  | 11 / 14 px         | +0.6 px, UPPERCASE | Labels above amounts             |


**Marketing scale (public home page).** The home page sets its headline at 46 px ExtraBold, −0.03 em tracking, and section titles at 26–40 px ExtraBold. Body text there uses #3B4658 instead of text-secondary so it reads at AAA on the page background; text-secondary stays for labels and captions.

- Amounts and titles in text-primary; everything supporting in text-secondary.
- In columns of numbers use tabular figures (`font-variant-numeric: tabular-nums`) to align amounts.
- No more than three different styles in the same card.

## Spacing, radii and layout

Spacing follows a 4 px scale; radii are generous for a soft, reassuring look.


| Token       | Value  | Typical use                                 |
| ----------- | ------ | ------------------------------------------- |
| space/xs    | 4 px   | Between title and subtitle                  |
| space/sm    | 8 px   | Between icon and label                      |
| space/md    | 12 px  | Between items in a row                      |
| space/lg    | 16 px  | Mobile card padding, mobile page margins    |
| space/xl    | 24 px  | Between cards on desktop, hero card padding |
| radius/sm   | 8 px   | Chips, control segments                     |
| radius/md   | 12 px  | Buttons, fields, icon containers            |
| radius/lg   | 24 px  | Cards (28 px for hero cards)                |
| radius/full | 999 px | Avatars, change chips, "+" button           |


**Breakpoints**


| Device  | Width       | Navigation                                         | Grid                                                 |
| ------- | ----------- | -------------------------------------------------- | ---------------------------------------------------- |
| Mobile  | < 768 px    | Floating glass navigation pill, 12 px from edges and safe area | 1 column, 16 margins, 16 gap               |
| Tablet  | 768–1279 px | Icon-only glass island in an 88 px column         | 2 columns, 24 margins, 20 gap                        |
| Desktop | ≥ 1280 px   | Labeled glass island in a 248 px column            | Fluid area + fixed 360 px column, 32 margins, 24 gap |


Design is **mobile-first**: every new screen starts at 390 px and then widens. On desktop the "+" button becomes the "New transaction" button in the top bar. Cards in the same row always share the same height.

## Iconography

Icons are outlined, on a 24 × 24 px grid, 2 px stroke with rounded caps and joins. The style is close to open-source sets like Lucide, which is worth adopting in code.

- **Sizes:** 24 px in navigation, 20 px in lists, 16–18 px inside buttons and chips.
- **Color:** text-secondary by default; brand when active; on-brand on blue backgrounds.
- **Icon container:** in lists the icon sits in a 40 × 40 px square, 12 radius, on the "soft" color of its category (e.g. warning-soft for bills, positive-soft for income).
- **Current set:** home, flows, investments, house, more, cart, bolt, briefcase, TV, bell, plus, cutlery, car, chevron, flame, droplet, wi-fi, document, wallet, calendar, bank, pie, coin.
- **Don't:** filled or multicolor icons, emoji in place of icons.

## Charts and data visualization

Every chart answers a single question, written in the card title. We use few chart types, always the same one for the same kind of data.


| Question                           | Chart                                         | Example                                     |
| ---------------------------------- | --------------------------------------------- | ------------------------------------------- |
| How does a value change over time? | Line with faded area                          | Net worth, portfolio value                  |
| Income vs expenses per period?     | Side-by-side green/red bars                   | Cash flow over 6 or 12 months               |
| How is a total split?              | Segmented horizontal bar (≤ 5 items) or donut | Net worth composition, spending by category |
| How close are we to a limit?       | Progress bar                                  | Budget by category                          |


- The current period is at full opacity; past periods at 55%.
- On Brand Dark backgrounds the line is light (#9DB6FF) with an area faded from the same color.
- A reference comparison (e.g. capital invested) is drawn dashed.
- No dense grids, 3D or distant legends: the legend sits right under the chart.
- An exceeded budget bar becomes full and red, and the card shows an alert with an action.

## Components and patterns

The components already exist in Figma in the "Componenti" section; every new screen reuses them rather than redrawing.


| Component               | Structure                                                                                                       | Where it's used                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Card                    | Glass surface, no 1 px border, inset highlight and stroke, soft shadow, 24 radius, 16 padding (mobile) / 20 (desktop); header with title + blue action | Everywhere |
| Hero card               | Brand-dark glass at 85%, 28 radius, overline + Display amount + change chip + chart                              | Net worth, Portfolio                               |
| Transaction Row         | Icon in 40 px container · title + subtitle · amount on the right                                                | Transactions, due dates, recurring items, accounts |
| Budget Row              | Color dot · category · spent / limit · 8 px bar                                                                 | Budget                                             |
| Holding Row             | Ticker badge · name + quantity · value + return                                                                 | Investments                                        |
| Nav Item / Sidebar Item | Icon + label, Active / Inactive state                                                                           | Bottom bar, sidebar                                |
| Change chip             | Green or red pill with ▲/▼ and percentage                                                                       | Hero cards, KPIs                                   |
| Alert with action       | Warning-soft background, icon in a circle, title + sentence with a proposal                                     | Exceeded budget, rebalancing                       |


**Fixed patterns**

- Every card has a title on the left and at most one text action on the right.
- Outgoing amounts carry "−"; incoming amounts carry "+" and are green. Expenses stay text-primary so lists don't turn entirely red.
- One primary action per screen.

## Liquid Glass

Liquid Glass is the application's visual style. Cards, buttons and dropdown menus let the background show through. Profile and settings offers a browser-local transparency slider with a live preview. The slider runs from opaque surfaces at 0% to the default glass effect at 100%. Reduced-transparency preferences and the no-blur fallback use opaque surfaces automatically.

**Principle.** Glass needs something beneath it. A soft low-saturation gradient of brand, chart-2 and chart-4 gives the glass depth, painted on a fixed background layer rather than `background-attachment: fixed` so it works on iOS.

**Glass tokens** (the default Tokens collection; dark values are reserved for a future dark theme)


| Token             | Light                                | Dark                  | Use                                        |
| ----------------- | ------------------------------------ | --------------------- | ------------------------------------------ |
| glass/fill        | white 55%                            | #0F172A 45%           | Fill of glass surfaces                     |
| glass/fill-strong | white 72%                            | #0F172A 60%           | Long-list cards and sheets over other glass |
| glass/popup-fill  | white 94%                            | To be defined        | Legible dropdown menus over other content   |
| glass/stroke      | white 70%, 1 px inner                | white 18%, 1 px inner | Luminous edge that defines the shape       |
| glass/highlight   | white gradient 60% → 0% from the top | white 25% → 0%        | Reflection on the top edge                 |
| glass/shadow      | 0 8 32 #1B2B5E 12%                   | 0 8 32 black 40%      | Separation from the background             |
| glass/blur        | 24 px                                | 24 px                 | Background blur (16 px on small controls)  |
| glass/saturate    | 180%                                 | 160%                  | Keeps colors vivid as they show through    |
| glass/tint-brand  | #2F5BEA at least 90%                 | To be verified        | Tinted-glass primary button with AA text   |
| glass/hairline    | #0F172A 6%                          | To be defined         | Quiet row dividers, replacing border      |


**Where it applies**

- **Cards:** summary cards, KPIs and hero cards become glass (the hero card uses a brand-dark tint at 85%). Radii grow by 4 px (card 24, hero 28) for a softer look.
- **Hero-tint deviation:** increase brand-dark from 70% to 85% because the 11–12 px `#d0dcff` captions reached only about 3.9–4.05:1 over the lightest backdrop, below AA's 4.5:1. At 85% over `#f5f6fa`, the computed caption contrast is 6.36:1 (6.38:1 for the actual `#d9` alpha), so captions retain their existing color.
- **Buttons:** the primary button is brand-tinted glass at least 90% with on-brand text. This deliberately increases the original 70% tint: white 12–14 px text at 70% has about 3.1:1 contrast, while 90% gives about 4.6:1. Keep white reflections at the edge of primary controls so they do not lighten the text surface. Secondary and icon buttons are clear glass. On press glass brightens and scales to 97%; primary controls brighten their edge rather than their text surface to preserve contrast. Reduced motion removes the scale.
- **Dropdown menus:** panel in near-opaque glass/popup-fill (94% white), 16 radius, 24 px blur, items separated by 1 px of glass/hairline; the selected item has a brand-soft pill at 60%.
- **Navigation:** the mobile bottom bar floats 12 px from the edges. Tablet and desktop use an inset glass island with a rounded edge and a blue active pill.
- **Fields and nested panels:** fields use a recessed translucent fill and inset shadow. Segments, statistics, edit panels and badges use translucent fills without additional blur.
- **Scrollbars:** thin app-styled scrollbars, rounded translucent thumb, transparent track, with a Safari fallback.
- **Pickers:** dropdowns use the accessible in-house Select, including keyboard navigation, type-ahead and upward opening near the mobile navigation. Date/month popup pickers remain native; only their fields are restyled.

**Legibility rules**

- Text, amounts and charts are always opaque: glass is only the surface, never the content.
- Never glass on glass on glass: two layers at most (card + open menu above it).
- Long lists (transactions, holdings) sit on a glass/fill-strong card to keep AA contrast.
- If the system requests reduced transparency or the browser doesn't support blur, it automatically falls back to the opaque surfaces of the standard theme.

**CSS reference**

The app's Lightning CSS build adds the `-webkit-` prefix, so source CSS must contain only unprefixed `backdrop-filter`; when copying this sample outside that build, add `-webkit-backdrop-filter: blur(24px) saturate(180%);`.

```css
.glass {
  background: rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(24px) saturate(180%);
  border-radius: 24px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.7),
    inset 0 0 0 1px rgba(255, 255, 255, 0.35),
    0 8px 32px rgba(27, 43, 94, 0.12);
}
.glass--primary { background: rgba(47, 91, 234, 0.9); color: #fff; }

@media (prefers-reduced-transparency: reduce) {
  .glass { background: #fff; backdrop-filter: none; }
}
@supports not (backdrop-filter: blur(1px)) {
  .glass { background: #fff; }
}
```

## Numbers, currency and dates

The app follows Italian conventions at launch; when it opens to other countries, formats will follow the user's locale.


| Element              | Format                                               | Example          |
| -------------------- | ---------------------------------------------------- | ---------------- |
| Amount               | € + space, dot for thousands, comma for decimals     | € 2.950,00       |
| Large rounded amount | No decimals above € 1,000 in summary cards           | € 184.250        |
| Sign                 | "+" for income, "−" (typographic minus) for expenses | − € 64,20        |
| Percentage           | One decimal, comma                                   | ▲ 2,4%           |
| Recent date          | Relative words                                       | Today, Yesterday |
| Date                 | Day + abbreviated month                              | 22 nov           |
| Reference month      | Full month + year                                    | Novembre 2026    |
| Separator            | Middle dot between pieces of information             | Spesa · Oggi     |


## Accessibility and next steps

**Accessibility**

- Minimum WCAG AA contrast: 4.5:1 for normal text, 3:1 for large text and icons. Check in particular text-secondary on surface-alt and labels on warning-soft.
- Touch targets of at least 44 × 44 px on mobile.
- Every chart has a text alternative (the key number in the title or legend).

**Next steps**

- Choose the final name and draw a vector version of the logo
- Define the dark theme as a second token mode
- Complete the Investments, Home and Net worth screens with these components
- Check contrast with a dedicated tool
- Prepare the tablet version of the Dashboard
