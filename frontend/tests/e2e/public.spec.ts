import { expect, test } from "@playwright/test"

import { expectAccessible, expectNoHorizontalScroll, shot } from "./helpers"

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme })

    test("landing page", async ({ page }, info) => {
      await page.goto("/")
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        /Plain-English questions\.\s*SQL you can check\./,
      )
      await expect(page.getByText("These five states account for")).toBeVisible()
      await expectNoHorizontalScroll(page)
      await expectAccessible(page)
      await shot(page, info, `landing-${scheme}`)
    })

    test("evals page", async ({ page }, info) => {
      await page.goto("/evals")
      await expect(page.getByRole("heading", { name: "Evaluation results" })).toBeVisible()
      await expectNoHorizontalScroll(page)
      await expectAccessible(page)
      await shot(page, info, `evals-${scheme}`)
    })

    test("login page", async ({ page }, info) => {
      await page.goto("/login")
      await expect(page.getByRole("button", { name: /Continue as Ana/ })).toBeVisible()
      await expectNoHorizontalScroll(page)
      await expectAccessible(page)
      await shot(page, info, `login-${scheme}`)
    })
  })
}

test("signed-out visit to the app returns to it after login", async ({ page }) => {
  await page.goto("/app/catalog")
  await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fcatalog/)
  await page.getByRole("button", { name: /Continue as Bruno/ }).click()
  await expect(page).toHaveURL(/\/app\/catalog$/)
  await expect(page.getByRole("heading", { name: "Data catalog" })).toBeVisible()
})

test("unknown pages show the custom 404", async ({ page }) => {
  const res = await page.goto("/definitely-not-here")
  expect(res?.status()).toBe(404)
  await expect(page.getByRole("heading", { name: "This page doesn't exist" })).toBeVisible()
})
