import AxeBuilder from "@axe-core/playwright"
import { expect, type Page, type TestInfo } from "@playwright/test"

/** Zero serious/critical axe violations, in both themes. */
export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze()
  const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")
  expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([])
}

export async function shot(page: Page, info: TestInfo, name: string) {
  await page.screenshot({ path: `tests/e2e/artifacts/screens/${info.project.name}/${name}.png`, fullPage: false })
}

/** No horizontal page scroll (checked at every device width). */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

export async function ask(page: Page, question: string) {
  const box = page.getByRole("textbox", { name: "Ask a question about the data" })
  await box.fill(question)
  await box.press("Enter")
}
