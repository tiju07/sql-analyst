import {
  ABOUT_ME,
  expect,
  expectAccessible,
  expectNoHorizontalScroll,
  openSidebar,
  ROUTES,
  setTheme,
  shot,
  test,
} from "./fixtures"

for (const theme of ["light", "dark"] as const) {
  test.describe(`${theme} theme`, () => {
    for (const route of ROUTES) {
      test(`${route.name} renders, is accessible and fits the screen`, async ({ page }, info) => {
        await setTheme(page, theme)
        const res = await page.goto(route.path)
        expect(res?.status()).toBe(200)
        await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible()
        await expect(page.locator("h1")).toHaveCount(1)
        await page.waitForLoadState("networkidle")
        await expectNoHorizontalScroll(page)
        await expectAccessible(page)
        await shot(page, info, `${route.name}-${theme}`)
      })
    }
  })
}

test("the 404 page is branded and returns 404", async ({ page }, info) => {
  const res = await page.goto("/does-not-exist/")
  expect(res?.status()).toBe(404)
  await expect(page.getByRole("heading", { name: "This page does not exist" })).toBeVisible()
  await expect(page.getByRole("link", { name: /About me/ })).toHaveAttribute("href", ABOUT_ME)
  await expectAccessible(page)
  await shot(page, info, "404")
})

test("About me links point to the portfolio on every page", async ({ page }) => {
  for (const route of ROUTES) {
    await page.goto(route.path)
    if (route.path.startsWith("/app")) await openSidebar(page)
    const links = page.locator(`a[href="${ABOUT_ME}"]`)
    await expect(links.first()).toBeAttached()
    for (const link of await links.all()) {
      await expect(link).toHaveAttribute("target", "_blank")
      await expect(link).toHaveAttribute("rel", "noopener noreferrer")
    }
  }
  // Landing: nav, closing band and footer.
  await page.goto("/")
  expect(await page.locator(`a[href="${ABOUT_ME}"]`).count()).toBeGreaterThanOrEqual(3)
})

for (const path of ["/login/", "/signup/"]) {
  test(`${path} is closed`, async ({ page }) => {
    await page.goto(path)
    await expect(page.getByText("Sign-ups and sign-ins are closed.")).toBeVisible()
    for (const input of await page.locator("input").all()) await expect(input).toBeDisabled()
    await expect(page.getByRole("button", { name: /Sign in|Create account/ })).toBeDisabled()
  })
}

test("security headers and the CSP are served", async ({ page }) => {
  const res = await page.goto("/")
  const h = res!.headers()
  expect(h["content-security-policy"]).toContain("connect-src 'self'")
  expect(h["x-frame-options"]).toBe("DENY")
  expect(h["x-content-type-options"]).toBe("nosniff")
})
