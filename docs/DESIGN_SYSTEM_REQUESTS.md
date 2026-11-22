# Design system requests

Gaps found in Foundry (`~/Desktop/PlayingAround/design-system/`) while building the SQL Analyst
static demo. The design system was not changed; each item has a local fix in this project, named
below, that can be removed once Foundry covers it.

| # | Area | What is missing or wrong | Local fix |
|---|---|---|---|
| 1 | Server components | `buttonClass`, `ABOUT_ME_URL` and `themeInitScript` are exported from `"use client"` modules, so a Next.js server component cannot call or read them (calling `buttonClass` fails the build; the others arrive as client references). Suggest moving plain values and helpers to a module without `"use client"`. | `frontend/components/marketing/links.tsx` (`ButtonLink`, `AboutMeButton`, `AboutMeLink`), `frontend/lib/theme-script.ts` (copy of the init script, same storage key). |
| 2 | Theme | `useTheme` keeps state per component, so several components using it disagree after one of them toggles. Suggest a shared store that follows the `data-theme` attribute and the system setting. | `frontend/lib/theme.ts` (`useResolvedTheme`, `setTheme`) and `frontend/components/layout/ThemeToggle.tsx`. |
| 3 | Contrast | Light `--success` (#0b7d55) and `--warning` (#a8590a) text on their soft backgrounds measure about 4.4:1, below AA (axe `color-contrast`, used by `StatusPill` and toned `Badge`). Dark blue `--accent` (#3b82f6) under white button text measures 3.7:1. | Token overrides at the top of `frontend/app/globals.css` (#08704c, #92500a; dark blue accent #2563eb). |
| 4 | Largest Contentful Paint | The hero rise-in animates from `opacity: 0`; Chrome does not count an element that first paints fully transparent, so the headline is never the LCP element. Starting at 0.01 looks the same. | `@keyframes foundry-rise` redefined in `frontend/app/globals.css`. |
| 5 | Table | The `Table` wrapper scrolls horizontally but cannot take focus, which fails axe `scrollable-region-focusable` on phones. Suggest `tabIndex={0}`, `role="region"` and an `aria-label` prop on the wrapper. | Own wrapper on the Method page, `frontend/app/(site)/evals/page.tsx`. |
| 6 | SiteNav | No slot for a quiet secondary link such as "Sign in"; it can only go among the anchors, which hide below `md`. | "Sign in" passed as a normal nav link in `frontend/components/marketing/chrome.tsx`; also in the footer. |
| 7 | AppShell | Nav items are buttons with `onNavigate`, not links, and there is no phone drawer, so a routed app cannot use it directly. | The product keeps its own shell restyled with Foundry tokens (`frontend/components/layout/AppShell.tsx`); the walkthrough scenes use Foundry `AppShell` and `AppShell compact`. |
| 8 | Touch targets | `IconButton` and `ThemeToggle` are 32 px; touch screens need 44 px (WCAG 2.5.8). | `@media (pointer: coarse)` minimum sizes in `frontend/app/globals.css`. |
| 9 | Lint | `SiteNav`, `SiteFooter` and `ClosedAuthCard` use `<a href="/">` (Next.js lint rule `no-html-link-for-pages`) and `useTheme` sets state in an effect (`react-hooks/set-state-in-effect`). | Both rules are switched off for `design-system/**` only in `frontend/eslint.config.mjs`. |
| 10 | Walkthrough | `Appear` applies a transform, which makes it the containing block for absolutely positioned children (a fixed-position composer inside it moved off screen). Worth a note in DESIGN.md section 5, or an option to animate opacity only. | Scene composer takes an `opacity` prop instead (`frontend/components/walkthrough/scenes.tsx`). |
