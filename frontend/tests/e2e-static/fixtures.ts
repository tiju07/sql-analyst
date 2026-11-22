import AxeBuilder from "@axe-core/playwright"
import { test as base, expect, type Page, type TestInfo } from "@playwright/test"

export const ABOUT_ME = "https://tiju-lukose.pages.dev/"

export const ROUTES = [
  { path: "/", name: "landing" },
  { path: "/evals/", name: "method" },
  { path: "/app/", name: "app-ask" },
  { path: "/app/catalog/", name: "app-catalog" },
  { path: "/app/verified/", name: "app-verified" },
  { path: "/runs/r-admin-q2-1/", name: "run" },
  { path: "/login/", name: "login" },
  { path: "/signup/", name: "signup" },
] as const

/**
 * Every test fails if the page makes a request to anything but its own origin (the static demo
 * has no runtime network), logs a console error, or throws.
 */
export const test = base.extend<{ guard: { problems: string[] } }>({
  guard: [
    async ({ page, baseURL }, use) => {
      const problems: string[] = []
      page.on("request", (r) => {
        const url = r.url()
        if (!url.startsWith(baseURL ?? "") && !url.startsWith("data:") && !url.startsWith("blob:"))
          problems.push(`external request: ${url}`)
      })
      page.on("console", (m) => {
        // The 404 page is served with status 404 on purpose. WebKit doesn't know the viewport's
        // interactive-widget key (set in app/(product)/layout.tsx) and logs it as an error.
        if (m.type() === "error" && !/status of 404|"interactive-widget" not recognized/.test(m.text()))
          problems.push(`console error: ${m.text()}`)
      })
      page.on("pageerror", (e) => problems.push(`page error: ${e.message}`))
      await use({ problems })
      expect(problems, problems.join("\n")).toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

export async function setTheme(page: Page, theme: "light" | "dark") {
  await page.emulateMedia({ colorScheme: theme })
}

/** Zero serious or critical axe violations. */
export async function expectAccessible(page: Page) {
  // Let entrance fades finish so contrast is measured on the settled page (loops never finish).
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => null)),
    ),
  )
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze()
  const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")
  expect(
    bad.map(
      (v) =>
        `${v.id}: ${v.nodes
          .map((n) => n.target.join(" "))
          .slice(0, 3)
          .join(", ")}`,
    ),
  ).toEqual([])
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

export async function shot(page: Page, info: TestInfo, name: string) {
  await page.screenshot({ path: `tests/e2e-static/artifacts/screens/${info.project.name}/${name}.png`, fullPage: true })
}

/** Open the sidebar drawer on narrow screens; the desktop sidebar is always there. */
export async function openSidebar(page: Page) {
  const menu = page.getByRole("button", { name: "Open menu" })
  if (await menu.isVisible()) await menu.click()
}
