# Foundry design system

One look for every project in `~/Desktop/PlayingAround/`. It takes Linear's precision (near-black canvas, tight type, hairline borders, the product shown in the hero) and Render / Vercel's clarity (white canvas, mono labels, small radii, one accent). It is the same language as the portfolio site at https://tiju-lukose.pages.dev/.

The goal: a visitor should think "an experienced engineer built this and it is ready for users", not "a demo".

Live reference: run `pnpm dev` in this folder and open http://localhost:5199.

---

## 1. Principles

1. **Quiet by default.** Neutral surfaces, one accent, almost no gradients. Colour is used for meaning (status) or one call to action per view.
2. **Hairlines, not boxes.** Separate with 1 px borders and spacing. Avoid heavy shadows, thick coloured borders and stacked cards.
3. **Dense but readable.** App screens are compact (13 to 14 px body in tables, 32 to 36 px controls). Marketing is airy (large type, wide spacing).
4. **Typography does the work.** Large headlines with negative tracking, mono for labels and IDs, tabular numbers for data.
5. **Show the product.** Landing pages lead with the real UI (the walkthrough), not stock art or illustrations.
6. **Every state is designed.** Hover, focus, active, disabled, loading, empty and error. If a control cannot be used, say why.
7. **Fast and accessible.** WCAG 2.2 AA, keyboard first, reduced motion respected, no layout shift.
8. **Boring where it should be.** Standard patterns for tables, forms and navigation. Spend originality on the walkthrough and the copy.

### Things that make a UI look childish (do not do these)
- Emoji as icons or decoration. Use `lucide-react` icons only.
- Rainbow gradients, glowing neon, glassmorphism everywhere, big drop shadows.
- Rounded pill buttons everywhere, 16 px or larger radii on small controls, bubbly cards.
- Multiple accent colours on one screen. Default colours from a CSS framework.
- Centered body text in long paragraphs, ALL CAPS headings, bold on everything.
- Stock illustrations, 3D blobs, mascot art, "hero" images with no product in them.
- Exclamation marks and cute copy. Write like documentation: plain, specific, calm.

---

## 2. Tokens

Source of truth: `src/styles/tokens.css`. Tailwind utilities are mapped in `src/styles/theme.css`.

### 2.1 Colour roles

| Role | Utility | Light | Dark |
|---|---|---|---|
| Page background | `bg-bg` | `#ffffff` | `#08090a` |
| Subtle background (sidebars, footers) | `bg-bg-subtle` | `#fafafa` | `#0c0d0f` |
| Surface (cards, inputs) | `bg-surface` | `#ffffff` | `#0f1012` |
| Raised / hover | `bg-surface-2`, `bg-surface-3` | `#f5f5f6`, `#ededef` | `#16171a`, `#1d1e22` |
| Border | `border-line` | `#e4e4e7` | `#1f2023` |
| Strong border | `border-line-strong` | `#cfcfd4` | `#2d2e33` |
| Primary text (headings, values) | `text-fg` | `#0d0d0f` | `#f7f8f8` |
| Body text | `text-fg-2` | `#4d4d54` | `#c2c4c9` |
| Muted text | `text-fg-muted` | `#6b6b73` | `#8a8f98` |
| Faint (placeholders, disabled) | `text-fg-faint` | `#94949c` | `#62656c` |
| Accent | `bg-accent`, `text-accent-ink`, `bg-accent-soft` | violet `#6c35f5` | `#7c4dff` |
| Success / Warning / Danger / Info | `text-success`, `bg-success-soft` ... | see tokens | see tokens |

Rules:
- Body text is `text-fg-2`; headings and key numbers are `text-fg`; helper text is `text-fg-muted`. Never use `text-fg-faint` for content that matters (it is for placeholders and disabled states).
- Status uses the semantic colours with a soft background and a dot, never colour alone (always add a word or icon).
- The accent marks the primary action, the current selection, focus rings, and one highlight per view.
- **Per-product accent:** set `data-accent` on `<html>`: `violet` (default), `blue`, `teal`, `amber`, `rose`, `cyan`. Choose one per product and keep it everywhere. Suggested: Text-to-SQL `blue`, LLM Gateway `violet`, GST Invoice `teal`, Issue-to-PR `violet`, Agent Memory `cyan`, Voice Receptionist `rose`, RedLab `amber`, Claims Copilot `blue`, PII Shield `teal`, Pharma Integrity `cyan`.

### 2.2 Type

Fonts: **Geist** (UI) and **Geist Mono** (labels, IDs, code), self-hosted through `@fontsource-variable` (no external requests, fine for Cloudflare Pages).

| Use | Size | Weight | Tracking | Notes |
|---|---|---|---|---|
| Display (landing h1) | `clamp(2.4rem, 6vw, 4.5rem)` | 500 | `-0.045em` | line-height 1.02, `text-balance` |
| Section title (h2) | `clamp(1.9rem, 3.6vw, 2.7rem)` | 500 | `-0.035em` | line-height 1.08 |
| Card title (h3) | 1.02 to 1.08rem | 500 | `-0.015em` | |
| App page title | 20 px | 500 | `-0.02em` | |
| Body | 16 px (marketing), 14 px (app) | 400 | 0 | line-height 1.6 |
| Table / dense UI | 13 to 14 px | 400 to 500 | 0 | |
| Label (`.label`) | 11.5 px mono uppercase | 500 | `0.08em` | section eyebrows, table headers |
| Numbers | any | 500 | `-0.02em` | add `tabular` class for columns |

Headings are weight **500**, not bold. Use `text-balance` on headlines and `text-pretty` on paragraphs.

### 2.3 Space, radius, elevation, motion
- **Spacing:** 4 px grid. Marketing sections are separated by `pt-28` (112 px). App content padding 20 to 24 px.
- **Radius:** `sm 4` (badges, kbd), `md 6` (buttons, inputs), `lg 8` (cards, tables, hairline grids), `xl 12` (app windows), `2xl 16` (large CTA bands only). Never use fully round pills except status pills and avatars.
- **Elevation:** borders first. `shadow-xs/sm` for raised controls, `shadow-pop` for menus and dialogs, `shadow-window` only for the product window in the hero. In dark mode shadows are replaced by a faint white ring.
- **Motion:** `--ease-out: cubic-bezier(.2,.7,.2,1)`, durations 120 / 200 / 400 ms. Animate opacity, transform and colour only. Page-load rise-in for hero elements (staggered 80 ms). Everything is disabled under `prefers-reduced-motion`.
- **Layout:** container 1200 px, gutter 32 px (20 px on phones). Sticky nav 56 px.

---

## 3. Components (`src/components`)

Import from the package index: `import { Button, Card, Walkthrough } from "@/design-system"`.

| Group | Components |
|---|---|
| Primitives | `Button`, `LinkButton`, `IconButton`, `Badge`, `Dot`, `Kbd`, `Card`, `CardHeader`, `Input`, `Textarea`, `Field`, `Tabs`, `Callout`, `Progress`, `Skeleton`, `Stat`, `CodeBlock`, `Separator` |
| Data | `Table`, `THead`, `TBody`, `TR`, `TH`, `TD`, `EmptyState`, `Bar`, `Sparkline` |
| App shell | `AppShell` (supports `compact`), `PageHeader`, `Breadcrumb`, `StatusPill`, `Logo` |
| Marketing | `SiteNav`, `SiteFooter`, `Hero`, `GridBackdrop`, `Section`, `FeatureGrid`, `StatStrip`, `StackMarquee`, `Faq`, `CtaBand`, `ClosedAuthCard`, `ABOUT_ME_URL` |
| Theme | `ThemeToggle`, `useTheme`, `themeInitScript` |
| Demo engine | `Walkthrough`, `WindowFrame`, `Appear`, `Typing`, `Stream`, `Cursor`, `Ring`, and helpers `seg`, `count`, `typed`, `typedEnd`, `streamed`, `pointAt`, easing functions |

### Usage rules
- **Buttons:** one `primary` (accent) per view. Secondary actions are `outline` or `ghost`. The navigation CTA is `solid`. Destructive actions are `danger` and always confirm.
- **Icons:** `lucide-react`, 16 px in controls, 18 px in feature tiles, stroke width default. No emoji.
- **Cards:** `Card` with a `CardHeader` (title, optional description and action). Do not nest cards inside cards; use hairline dividers.
- **Tables:** `Table` primitives, 13 to 14 px, header uses the mono `.label` style, numbers right-aligned with `tabular`, status uses `StatusPill`. Rows get a hover state only if clickable.
- **Forms:** `Field` wraps label, control, hint and error. Errors are text plus `aria-invalid`, never colour only.
- **Empty states:** `EmptyState` with an icon, one sentence, and one action.
- **Hairline grids** (`.hairline` class, `FeatureGrid`, `StatStrip`) are the signature layout for feature lists and stats. Use them instead of rows of separate cards.

---

## 4. Page patterns

### 4.1 Landing page (every project)
Order, top to bottom. Keep it to one scroll of real content.
1. `SiteNav`: logo, 3 or 4 anchors, **About me** link (always), theme toggle, `solid` CTA ("Watch the demo").
2. `Hero`: status badge ("Interactive demo, simulated data"), one-line headline (outcome, not feature), two-line lede, two buttons (`Watch the walkthrough`, `About me`), then the **Walkthrough** inside the hero.
3. `StackMarquee`: the real stack.
4. `Section` "How it works": 3 to 4 steps as a `FeatureGrid` (icon, title, one sentence).
5. `Section` "What it does": 6 features in a `FeatureGrid` with tags.
6. Proof: `StatStrip` of **real measured numbers** only, from the project's own results files. If no real numbers exist, hide this section. Never invent numbers.
7. `Section` "Under the hood": architecture diagram (SVG or Mermaid rendered at build time), design decisions.
8. `Faq`: 4 to 6 honest questions (is it real, can I use it, what does it cost, where is the code).
9. `CtaBand` with the About me link, then `SiteFooter`.

Copy rules: headline states the outcome ("Ask your database anything. Get safe SQL."), no buzzwords, no "revolutionary", no exclamation marks. Say plainly that this is a demo with simulated data.

### 4.2 App screens (the simulated product)
- `AppShell` with a 216 px sidebar, 48 px top bar, content padded 20 to 24 px. `compact` in phone-sized demo scenes.
- Each screen: `PageHeader` (title, one-line description, actions), then content in `Card`s or tables.
- Include realistic data: believable names, IDs, timestamps, units. No lorem ipsum. Show truncation, long values and an error row somewhere.

### 4.3 Closed access
Sign-in and sign-up routes render `ClosedAuthCard` (visible form, disabled, with an explanation). Never a working form, never a redirect loop. Also say it in the hero badge and the footer.

### 4.4 About me
`SiteNav` and `SiteFooter` already include the **About me** link to `ABOUT_ME_URL` (`https://tiju-lukose.pages.dev/`). Keep both, and use it again in the `CtaBand`. External links use `target="_blank" rel="noopener noreferrer"` (the components do this).

---

## 5. The walkthrough demo

A scripted, animated tour of the product that plays inside a browser window. It is the centrepiece of each landing page.

### 5.1 How it works
- `Walkthrough` takes `scenes: WalkthroughScene[]`. Each scene has `title`, `caption` (1 to 2 plain sentences), `duration` (4000 to 9000 ms) and `render({ t, compact })`.
- `t` is milliseconds since the scene started. **Everything on screen is a function of `t`** (use `seg`, `count`, `Appear`, `Typing`, `Stream`, `Cursor`). No timers, no state in scenes. That makes it pausable, restartable and renderable at the end state for reduced motion.
- The window is 1120 x 680 by default and scales to fit. Below 560 px wide it switches to a **compact** layout (420 x 700) and scenes receive `compact: true`. Provide a real phone layout in compact mode (use `AppShell compact`), not a shrunken desktop.
- Autoplays when 40% visible, pauses when scrolled away or the tab is hidden. Controls: previous, play or pause, next, restart, segmented progress, step chips, arrow keys, space bar. Reduced motion: no autoplay, final state shown, step with previous and next.

### 5.2 Writing a good walkthrough (5 to 7 scenes, 35 to 55 seconds total)
1. **Land on the product** already in a useful state (a populated dashboard), not an empty screen.
2. **One action per scene.** Type a query, click a row, approve a plan. One idea, one outcome.
3. **Show the moment of value**: the answer streams, the red flag appears, the cost drops, the draft PR opens.
4. **Show a safeguard** at least once (a blocked action, an approval gate, a citation). That is what makes it credible.
5. **Cursor moves with intent**: click targets exist on screen at the coordinates in the path. Ease between points. Click ripple on each click.
6. **Pace for reading**: leave 1.2 s after text finishes typing or streaming before the next change.
7. **End on the outcome**, then loop.
8. **Captions explain, the UI shows.** Do not repeat the caption inside the window.

### 5.3 Simulated data
All data is static TypeScript fixtures in `src/fixtures/`, typed, seeded and obviously fictional (fictional company names, `example.com` domains, synthetic people). Never call a network API. Never store anything. Mark synthetic data on screen where it would be mistaken for real (for example a small `Synthetic` badge on documents and patients).

---

## 6. Accessibility and performance checklist
- Contrast AA in both themes (tokens are tuned for it); focus ring on every interactive element (`outline-accent`, 2 px, 2 px offset).
- Semantic landmarks, one `h1` per page, labelled controls, skip link on landing pages.
- The walkthrough has `role="region"`, an `aria-live` caption, a real step list for screen readers, and its animated window is `aria-hidden` and `inert`.
- No colour-only meaning. Targets at least 44 x 44 px on touch (pad small controls).
- Lighthouse (mobile) on the landing page: Performance 90+, Accessibility 100, Best Practices 95+, SEO 95+. Lazy-load the walkthrough below the fold if it hurts LCP (the hero text must render without waiting for it). Reserve its height to avoid layout shift. Fonts self-hosted, `font-display: swap`.
- Total JS for the landing page under 200 kB gzipped.

---

## 7. Do and do not (quick reference)

| Do | Do not |
|---|---|
| One accent per product | Several bright colours at once |
| Hairline borders, small radii | Heavy shadows, 16 px+ radii everywhere |
| Lucide icons, real UI screenshots | Emoji, stock art, 3D blobs |
| Plain, specific copy | Hype words, exclamation marks |
| Tabular numbers, mono labels | Proportional numerals in tables |
| Realistic fixture data with edge cases | "Lorem ipsum", "Item 1", "John Doe" everywhere |
| Show a safeguard in the demo | Only show the happy path |
