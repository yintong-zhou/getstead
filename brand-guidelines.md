# getstead Brand Guidelines v0.2

Updated November 23, 2026

These guidelines describe the current getstead interface. Use the shared components and CSS tokens when extending it. The original Figma drafts are design references.

## Brand and voice

getstead brings cash flow, budgets, net worth, investments, recurring expenses, and property into one place. Its promise is simple: **always know where you stand, effortlessly**.

- **Clarity.** Show the number that matters first, then provide a way to see the detail.
- **Trust.** Explain how a number was calculated and distinguish recorded amounts from estimates.
- **Calm.** Use plain language and explain what the user can do next when something needs attention.
- **Control.** Give people clear choices and confirm irreversible actions before applying them.

Use short sentences, familiar terms, and action verbs. English is the primary product and documentation language. Italian is the second interface language and addresses the user informally. Describe features that exist today. Investment copy reports values and performance. Automatic bank connections, product billing, and investment recommendations are outside the current scope. Price sync updates market quotes for linked instruments.

| Situation | Example |
| --- | --- |
| Action | View all transactions |
| Success | Recurring expense deleted. |
| Empty state | No transactions match your filters. |
| Investment performance | Portfolio value rose by €145.20. |

## Name and logo

Write **getstead** in lowercase. The mark is a glass drop with two round eyes, a curled tip, and a blue to violet gradient. The shared [BrandMark](components/brand-mark.tsx) renders it beside the wordmark at 36 × 36 px.

- The transparent master is in [docs/brand](docs/brand/getstead-mark.png). Use the [public mark](public/brand/getstead-mark.png) in the app, the [favicon](app/icon.png) for browser tabs, and the [Apple icon](app/apple-icon.png) for home screens.
- Leave clear space of at least a quarter of the mark's width. Use it at 24 px wide or larger. At smaller sizes, use the wordmark alone.
- Preserve the shape, proportions, colors, and transparency. The home screen asset has its own background. Interface icons use one color.

## Color and surfaces

[Global CSS](app/globals.css) defines the colors for both themes. Profile lets the user follow the device theme or choose light or dark. Use CSS tokens so components respond to that preference.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--brand` | `#2F5BEA` | `#86A3FF` | Links, active controls, and focus |
| `--brand-fill` | `#2F5BEA` | `#2F5BEA` | Solid blue behind white text |
| `--brand-dark` | `#1B2B5E` | `#1B2B5E` | Tinted summary surfaces |
| `--brand-soft` | `#E3EAFD` | `#1F2B52` | Selection and hover backgrounds |
| `--bg` | `#F5F6FA` | `#0B1020` | Page background |
| `--surface` | `#FFFFFF` | `#141B30` | Opaque surface and popover text background |
| `--surface-alt` | `#EEF1F7` | `#1C2540` | Recessed surface and control tracks |
| `--border` | `#E2E8F0` | `#2B3659` | Borders where separation is needed |
| `--ink` | `#0F172A` | `#E8EDF8` | Titles, values, and primary text |
| `--muted` | `#536277` | `#A6B4CC` | Supporting text and quiet controls |
| `--positive` | `#16A34A` | `#4ADE80` | Income, gains, and success |
| `--negative` | `#DC2626` | `#F87171` | Losses, errors, and destructive actions |
| `--warning` | `#F59E0B` | `#FBBF24` | Warnings and due dates |

Pair color with a sign, icon, or label. Use the corresponding semantic `*-ink` token for text on a semantic `*-soft` background. Chart series use `--chart-1` through `--chart-5`.

### Liquid Glass

Glass is a surface treatment. Keep text, figures, and strokes opaque. A fixed wash behind the content adds depth. Use a stronger surface for long lists and a near opaque surface for menus. Profile's transparency control ranges from opaque to the default glass effect. System preferences and the blur fallback also produce opaque surfaces when applicable.

| Token | Light default | Dark default | Use |
| --- | --- | --- | --- |
| `--glass-fill` | `#FFFFFF8C` | `#1A2340A6` | Cards and controls |
| `--glass-fill-strong` | `#FFFFFFB8` | `#1A2340D1` | Long lists |
| `--glass-popup-fill` | `#FFFFFFF0` | `#182038F2` | Dropdowns, dialogs, and notifications |
| `--glass-hairline` | `#0F172A0F` | `#FFFFFF14` | Dividers |
| `--glass-blur` | 24 px | 24 px | Main surfaces |
| `--glass-blur-control` | 16 px | 16 px | Smaller controls |

Use shared surface styles for highlights, inset edges, and shadows. Limit the visible stack of glass surfaces so text remains legible. Check contrast on the actual composited surface in both themes.

## Typography and layout

**Plus Jakarta Sans** is served locally as a variable font with weights 400–800. The [locale layout](app/%5Blocale%5D/layout.tsx) defines the font and fallback stack.

| Role | Size and line height | Typical weight |
| --- | --- | --- |
| Page title | 22 / 28 px | 800 |
| Card title | 17 / 24 px | 700 |
| Body | 14 / 20 px | 500 |
| Caption | 12 / 16 px | 500 |
| Summary amount | 32 / 38 px | 800 |
| Chart headline amount | 36 px, down to 32 px on narrow screens | 700 |

The public landing page scales its headline from 30 to 46 px and its section headings from 26 to 40 px. Use tabular numerals for amounts and aligned figures.

Build from mobile layouts and check narrow screens such as 390 px. Use a 4 px spacing scale, 16 px as the base card padding, 12 px for control radii, and 24 px for card radii. The floating bottom navigation gives way to an icon rail at 768 px, then a labeled sidebar at 1280 px. Let card grids adapt to the content and available width.

## Icons and interaction patterns

Use the shared [Icon](components/icon.tsx) library. Icons use a 24 × 24 drawing grid, a 2 px stroke, and rounded caps and joins. Typical rendered sizes are 24 px for navigation, 20 px for list rows, and 16–18 px inside buttons. Give icon buttons accessible names and center the SVG inside the hit area. Use a drawn X for close buttons so the font baseline does not shift it.

| Pattern | Guidance |
| --- | --- |
| Toolbar | Keep related actions together. Trend cards use an eye button on the left, with price sync next to it when available on Investments. |
| Dropdown | Use the shared Select with keyboard navigation and search where the option count warrants it. Menus inside dialogs must remain above the dialog and usable with keyboard and touch. |
| Date and month input | Use DateField and the app calendar. Month selection uses a grid. Choose the year from a full width grid with decade navigation, then return to the calendar. Keep four digit years on one line. |
| Expandable section | Use a labeled summary with a visible chevron. Rotate it when the section is open. |
| Contextual help | Place supplementary notes in an InfoTip beside the relevant label or section title. It opens on hover, keyboard focus, and tap. Keep warnings, empty states, and action feedback visible where relevant. |
| Feedback and confirmation | Use shared notifications and confirmation dialogs. Show a status icon and a clear message. Center the close icon. Destructive actions require confirmation that identifies the item and the consequence. |
| Long records | Show a short preview on an overview. Investments starts with 3 recent operations and can show 5. The separate history uses 25 rows per page, with filters preserved in the URL and paging reset when a filter is applied. |
| Archived records | Show a separate archived list behind an explicit filter. Explain what happens to any booked payments when a recurring expense is removed. |

Condominium costs use instalments that already include any balancing payments and extraordinary works. Show paid, overdue, upcoming, and expected total. Place optional explanations beside their headings.

## Charts, numbers, and dates

- Use a line with a faded area for changes over time, grouped bars for period comparisons, a donut or segmented bar for composition, and a progress bar for limits. Put the legend near the chart when one is needed.
- Charts use the vendored Bklit components and Motion. Give each chart a text alternative. Use a tooltip for exact values. Use `--chart-*` tokens and align directional arrows and signs with the surrounding figures.
- Store and calculate amounts in integer cents or exact decimals. Format at display time using the user's locale. English uses en-GB and Italian uses it-IT. Use two decimals for detailed amounts and round only where the summary explicitly calls for whole euros.
- Use the typographic minus (−) for negative amounts and show a plus where it clarifies a change. Use a middle dot to separate related metadata.

| Example | English | Italian |
| --- | --- | --- |
| Amount | €2,950.00 | € 2.950,00 |
| Negative amount | −€64.20 | −€ 64,20 |
| Reference month | November 2026 | Novembre 2026 |

## Motion and accessibility

Share the easing curve and durations in [motion.ts](lib/motion.ts). Use 150 ms for quick feedback, 200 ms for menus and popovers, and 400 ms for entrances where motion helps. Animate transform and opacity. Respect reduced motion and reduced transparency.

- Target WCAG AA contrast. Use 4.5:1 for normal text and 3:1 for large text or meaningful control graphics.
- Keep mobile targets at least 44 × 44 px. Preserve visible focus and keyboard access to controls, dialogs, and their options.
- Review new screens in light and dark themes, at mobile and desktop widths, and with the keyboard.
