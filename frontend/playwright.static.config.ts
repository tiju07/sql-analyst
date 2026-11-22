import { defineConfig, devices } from "@playwright/test"

// The static demo: `pnpm build:static` first, then this serves out/ like Cloudflare Pages
// (scripts/serve-static.mjs applies public/_headers, including the CSP). No backend, no Docker.
const PORT = 3152

export default defineConfig({
  testDir: "tests/e2e-static",
  outputDir: "tests/e2e-static/artifacts/results",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { outputFolder: "tests/e2e-static/artifacts/report", open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `node scripts/serve-static.mjs out ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "iphone-13", use: { ...devices["iPhone 13"] } },
    { name: "pixel-7", use: { ...devices["Pixel 7"] } },
    { name: "ipad", use: { ...devices["iPad (gen 7)"] } },
    { name: "desktop-1440", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
})
