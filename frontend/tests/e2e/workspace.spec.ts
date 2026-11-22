import { expect, test, type Page } from "@playwright/test"

import { stateFile } from "./global-setup"
import { ask, expectAccessible, expectNoHorizontalScroll, shot } from "./helpers"

const answerCard = (page: Page) => page.getByRole("article").last()

test.describe("analyst", () => {
  test.use({ storageState: stateFile("analyst") })

  for (const scheme of ["light", "dark"] as const) {
    test(`ask, stream, and get SQL, table, chart and summary (${scheme})`, async ({ page }, info) => {
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto("/app")
      await expect(page.getByRole("heading", { name: "Ask the Olist marketplace" })).toBeVisible()
      await expect(page.getByText("order_items")).toBeVisible()
      await expectAccessible(page)
      await shot(page, info, `app-empty-${scheme}`)

      await ask(page, "Revenue by state")
      const card = answerCard(page)
      await expect(card.getByText("The query returned 10 rows.")).toBeVisible({ timeout: 20_000 })
      await expect(page).toHaveURL(/\/app\?c=/)
      await expect(card.getByRole("button", { name: "Show SQL" })).toBeVisible()
      await expect(card.getByRole("region", { name: /results table/ }).first()).toContainText("R$5,202,955.05")
      await expect(card.getByRole("radiogroup", { name: "Show the result as" })).toBeVisible()
      await expectNoHorizontalScroll(page)
      await expectAccessible(page)
      await shot(page, info, `app-answer-${scheme}`)

      await card.getByRole("button", { name: "Show SQL" }).click()
      await expect(card.locator("pre").first()).toContainText("SUM(i.price)")
      await card.getByRole("button", { name: "Good answer" }).click()
      await expect(page.getByText("Thanks, feedback saved")).toBeVisible()
    })
  }

  test("clarifying question pauses the run until answered", async ({ page }) => {
    await page.goto("/app")
    await ask(page, "Which are our best products?")
    const card = answerCard(page)
    await expect(card.getByRole("heading", { name: "Best by which measure?" })).toBeVisible({ timeout: 20_000 })
    await card.getByRole("button", { name: "Revenue" }).click()
    await expect(card.getByText("The query returned 10 rows.")).toBeVisible({ timeout: 20_000 })
    await expect(card.getByText("Best by which measure? Revenue")).toBeVisible()
  })

  test("stop cancels a running answer", async ({ page }) => {
    await page.goto("/app")
    await ask(page, "Revenue by state [slow]")
    const stop = page.getByRole("button", { name: "Stop" })
    await expect(stop).toBeVisible()
    await stop.click()
    await expect(answerCard(page).getByText("Stopped before an answer was ready.")).toBeVisible()
    await expect(page.getByRole("button", { name: "Send question" })).toBeVisible()
  })

  test("rate limit shows a countdown banner", async ({ page }) => {
    await page.route("**/api/chat", (route) =>
      route.fulfill({
        status: 429,
        contentType: "application/json",
        headers: { "Retry-After": "30" },
        body: JSON.stringify({
          code: "RATE_LIMITED",
          message: "Too many requests. Try again in 30 s.",
          retry_after_s: 30,
        }),
      }),
    )
    await page.goto("/app")
    await ask(page, "Revenue by state")
    await expect(page.getByRole("status").filter({ hasText: "faster than the demo allows" })).toBeVisible()
  })

  test("daily budget shows a paused banner", async ({ page }) => {
    await page.route("**/api/chat", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          code: "BUDGET_EXCEEDED",
          message: "The demo has reached today's AI budget. Back tomorrow.",
          retry_after_s: null,
        }),
      }),
    )
    await page.goto("/app")
    await ask(page, "Revenue by state")
    await expect(page.getByRole("status").filter({ hasText: "today's AI budget" })).toBeVisible()
  })

  test("catalog is read-only for analysts", async ({ page }, info) => {
    await page.goto("/app/catalog")
    await expect(page.getByRole("heading", { name: "Data catalog" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Re-sync" })).toHaveCount(0)
    await page.getByRole("button", { name: /^orders/ }).click()
    await expect(page.getByText("order_purchase_timestamp")).toBeVisible()
    await expect(page.getByRole("button", { name: /Edit description/ })).toHaveCount(0)
    await expectNoHorizontalScroll(page)
    await expectAccessible(page)
    await shot(page, info, "catalog")
  })

  test("inspector shows candidates, context and timing", async ({ page }, info) => {
    await page.goto("/app")
    await ask(page, "Orders by month")
    const card = answerCard(page)
    await expect(card.getByRole("button", { name: "Inspect" })).toBeVisible({ timeout: 20_000 })
    await card.getByRole("button", { name: "Inspect" }).click()
    await expect(page.getByText("Candidate 1")).toBeVisible()
    await page.getByRole("tab", { name: "Context" }).click()
    await expect(page.getByText("Tables shown to the model")).toBeVisible()
    await page.getByRole("tab", { name: "Timeline" }).click()
    await expect(page.getByText("Total time")).toBeVisible()
    await shot(page, info, "inspector")
  })

  test("command palette opens with the keyboard", async ({ page, isMobile }) => {
    test.skip(isMobile, "no hardware keyboard on phones")
    await page.goto("/app")
    const palette = page.getByPlaceholder("Type a command or search conversations")
    // The shortcut listener attaches on hydration; retry the keypress until it does.
    await expect(async () => {
      await page.keyboard.press("ControlOrMeta+k")
      await expect(palette).toBeVisible({ timeout: 1000 })
    }).toPass()
    await page.keyboard.type("catalog")
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(/\/app\/catalog/)
  })
})

test.describe("admin", () => {
  test.use({ storageState: stateFile("admin") })

  test("edits a column description", async ({ page }) => {
    await page.goto("/app/catalog")
    await page.getByRole("button", { name: /^sellers/ }).click()
    const edit = page.getByRole("button", { name: "Edit description of seller_city" })
    await edit.click()
    const text = `City of the seller's warehouse (${test.info().project.name})`
    await page.getByRole("textbox", { name: "Description of seller_city" }).fill(text)
    await page.getByRole("button", { name: "Save" }).click()
    await expect(page.getByText("Description saved")).toBeVisible()
    await expect(page.getByText(text)).toBeVisible()
  })

  test("verified queries page lists the review queue", async ({ page }, info) => {
    await page.goto("/app/verified")
    await expect(page.getByRole("heading", { name: "Verified queries" })).toBeVisible()
    await expectAccessible(page)
    await shot(page, info, "verified")
  })
})

test.describe("regional manager", () => {
  test.use({ storageState: stateFile("regional") })

  test("only ever sees São Paulo", async ({ page }) => {
    await page.goto("/app")
    await ask(page, "Revenue by state")
    const table = answerCard(page)
      .getByRole("region", { name: /results table/ })
      .first()
    await expect(table).toContainText("SP", { timeout: 20_000 })
    await expect(table).not.toContainText("RJ")
  })
})
