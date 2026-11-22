import { expect, test } from "./fixtures"

const TITLES = [
  "Start in the workspace",
  "Ask in plain English",
  "Check, run, repair",
  "The answer",
  "Ask when it is ambiguous",
  "Unsafe SQL never runs",
  "Each person sees only their rows",
  "Good answers teach the agent",
]

test("hero text and buttons render before the walkthrough", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Ask your database in plain English. Get safe, checked SQL.",
  )
  await expect(page.getByText("Interactive demo, simulated data")).toBeVisible()
  await expect(page.getByRole("link", { name: "Explore the app" }).first()).toHaveAttribute("href", "/app/")
})

test("the walkthrough autoplays and steps through every scene", async ({ page }) => {
  await page.goto("/")
  const region = page.getByRole("region", { name: "Product walkthrough" })
  await region.scrollIntoViewIfNeeded()
  await expect(region.getByRole("button", { name: "Pause walkthrough" })).toBeVisible()
  await expect(region.getByText("Step 1 of 8")).toBeVisible()
  await region.getByRole("button", { name: "Pause walkthrough" }).click()
  for (let i = 0; i < TITLES.length; i++) {
    await expect(region.getByText(`Step ${i + 1} of 8`)).toBeVisible()
    await expect(region.locator('[aria-live="polite"]')).toContainText(TITLES[i])
    if (i < TITLES.length - 1) await region.getByRole("button", { name: "Next step" }).click()
  }
  await expect(region.getByRole("button", { name: "Next step" })).toBeDisabled()
})

test("reduced motion: no autoplay, final frames, previous and next", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" })
  const page = await ctx.newPage()
  await page.goto("/")
  const region = page.getByRole("region", { name: "Product walkthrough" })
  await region.scrollIntoViewIfNeeded()
  await expect(region.getByRole("button", { name: /Play walkthrough|Pause walkthrough/ })).toHaveCount(0)
  // The first scene shows its final state: the counted-up order total.
  await expect(region.getByText("99,441").first()).toBeAttached()
  await region.getByRole("button", { name: "Next step" }).click()
  await expect(region.getByText("Step 2 of 8")).toBeVisible()
  await region.getByRole("button", { name: "Previous step" }).click()
  await expect(region.getByText("Step 1 of 8")).toBeVisible()
  await ctx.close()
})
