import { expect, openSidebar, test } from "./fixtures"

/** The Explore workspace on fixtures: every action plays a scripted simulation. */

async function ask(page: import("@playwright/test").Page, question: string) {
  await page.locator("#composer").fill(question)
  await page.locator("#composer").press("Enter")
}

test("asks a question and shows the answer, SQL and simulated metadata", async ({ page }) => {
  await page.goto("/app/")
  await expect(page.getByText("Demo workspace, simulated data.")).toBeVisible()
  await page.getByRole("button", { name: /Which 5 states had the highest revenue/ }).click()
  const answer = page.getByRole("article", { name: /Answer to: Which 5 states/ })
  await expect(answer.getByText("R$1,179,247.29").first()).toBeVisible({ timeout: 10_000 })
  await expect(answer.getByText(/São Paulo led 2018 Q2 with R\$1.18M/)).toBeVisible()
  await expect(answer.getByText("Simulated", { exact: true })).toBeVisible()
  await answer.getByRole("button", { name: "Show SQL" }).click()
  await expect(answer.getByLabel("SQL")).toContainText("SUM(i.price) AS revenue")
})

test("the guard blocks a destructive request", async ({ page }) => {
  await page.goto("/app/")
  await ask(page, "Delete all canceled orders")
  await expect(page.getByText("The generated query was blocked by the safety checks, so nothing ran.")).toBeVisible({
    timeout: 10_000,
  })
  await expect(page.getByText("Only SELECT queries are allowed, got DELETE.")).toBeVisible()
})

test("an ambiguous question asks first, then answers", async ({ page }) => {
  await page.goto("/app/")
  await ask(page, "Which are our best product categories?")
  await expect(page.getByText("Best by which measure?")).toBeVisible({ timeout: 10_000 })
  await page.getByRole("button", { name: "Revenue", exact: true }).click()
  await expect(page.getByText(/health_beauty \(R\$1.26M\)/)).toBeVisible({ timeout: 10_000 })
})

test("an unscripted question gets an honest answer, not an error", async ({ page }) => {
  await page.goto("/app/")
  await ask(page, "What is the weather in Recife?")
  await expect(page.getByText(/This question is not in the demo script/)).toBeVisible({ timeout: 10_000 })
})

test("the SP regional manager only sees SP", async ({ page }) => {
  await page.goto("/app/")
  await openSidebar(page)
  await page.getByLabel("View as").filter({ visible: true }).selectOption("regional")
  await expect(page.getByText(/You see: customers in sp/i)).toBeVisible()
  await ask(page, "Which 5 states had the highest revenue last quarter?")
  const answer = page.getByRole("article").last()
  await expect(answer.getByText("R$1,179,247.29").first()).toBeVisible({ timeout: 10_000 })
  await expect(answer.getByText("RJ", { exact: true })).toHaveCount(0)
})

test("propose a verified query and approve it as admin", async ({ page }) => {
  await page.goto("/app/")
  await page.getByRole("button", { name: /Which 5 states had the highest revenue/ }).click()
  await expect(page.getByRole("button", { name: "Propose as verified" })).toBeVisible({ timeout: 10_000 })
  await page.getByRole("button", { name: "Propose as verified" }).click()
  await page.getByRole("dialog").getByRole("button", { name: "Propose" }).click()
  await expect(page.getByText(/Simulated. Nothing is saved/).first()).toBeVisible({ timeout: 5000 })
  // Client-side navigation keeps the in-memory store.
  await openSidebar(page)
  await page.getByRole("link", { name: "Verified queries" }).click()
  const card = page.getByRole("listitem").filter({ hasText: "Which 5 states had the highest revenue last quarter?" })
  await card.getByRole("button", { name: "Approve" }).click()
  await page.getByRole("tab", { name: "Approved" }).click()
  await expect(
    page
      .getByRole("listitem")
      .filter({ hasText: "Which 5 states had the highest revenue last quarter?" })
      .getByText("Approved", { exact: true }),
  ).toBeVisible({ timeout: 5000 })
})

test("catalog: open a table and see its columns", async ({ page }) => {
  await page.goto("/app/catalog/")
  await page.getByRole("button", { name: /^orders/ }).click()
  await expect(page.getByRole("heading", { name: "olist.orders" })).toBeVisible()
  await expect(page.getByText("order_purchase_timestamp")).toBeVisible()
  await page.getByRole("tab", { name: "Metrics" }).click()
  await expect(page.getByText("late_delivery_rate", { exact: true })).toBeVisible()
})
