// Renders public/og.png (1200 x 630) with Playwright from a small HTML card in Foundry style.
// Fonts come from node_modules; nothing is fetched from the network. Run: pnpm og:image
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

import { chromium } from "@playwright/test"

const root = resolve(import.meta.dirname, "..")
const font = (pkg, file) => pathToFileURL(join(root, "node_modules/@fontsource-variable", pkg, "files", file)).href

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: Geist; src: url(${font("geist", "geist-latin-wght-normal.woff2")}) format("woff2"); font-weight: 100 900; }
@font-face { font-family: GeistMono; src: url(${font("geist-mono", "geist-mono-latin-wght-normal.woff2")}) format("woff2"); font-weight: 100 900; }
* { box-sizing: border-box; margin: 0; }
body { width: 1200px; height: 630px; background: #08090a; color: #c2c4c9; font-family: Geist; padding: 64px 72px; position: relative; overflow: hidden; }
.grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px); background-size: 56px 56px; mask-image: radial-gradient(ellipse 80% 70% at 30% 0%, #000 30%, transparent 75%); }
.logo { display: flex; align-items: center; gap: 12px; color: #f7f8f8; font-weight: 600; font-size: 26px; position: relative; }
.mark { width: 22px; height: 22px; background: #f7f8f8; clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 100%, 50% 50%, 0 50%); }
.badge { display: inline-flex; align-items: center; gap: 8px; margin-top: 56px; padding: 4px 10px; border-radius: 4px; background: rgba(59,130,246,.16); color: #8ab8ff; font-size: 18px; position: relative; }
.dot { width: 7px; height: 7px; border-radius: 99px; background: #3b82f6; }
h1 { margin-top: 22px; color: #f7f8f8; font-weight: 500; font-size: 70px; line-height: 1.02; letter-spacing: -0.045em; max-width: 800px; position: relative; }
.sql { position: absolute; right: 64px; bottom: 64px; width: 470px; border: 1px solid #2d2e33; border-radius: 12px; background: #0f1012; padding: 22px 24px; font-family: GeistMono; font-size: 17px; line-height: 1.6; color: #c2c4c9; }
.k { color: #8ab8ff; } .ok { margin-top: 14px; font-family: Geist; font-size: 16px; color: #3ecf8e; }
.foot { position: absolute; left: 72px; bottom: 64px; font-family: GeistMono; font-size: 16px; letter-spacing: .08em; text-transform: uppercase; color: #8a8f98; }
</style></head><body><div class="grid"></div>
<div class="logo"><span class="mark"></span>SQL Analyst</div>
<div class="badge"><span class="dot"></span>Interactive demo, simulated data</div>
<h1>Ask your database in plain English. Get safe, checked SQL.</h1>
<div class="sql"><span class="k">SELECT</span> c.customer_state,<br>&nbsp;&nbsp;<span class="k">SUM</span>(i.price) <span class="k">AS</span> revenue<br><span class="k">FROM</span> olist.order_items i<br><span class="k">GROUP BY</span> 1 <span class="k">ORDER BY</span> 2 <span class="k">DESC</span><div class="ok">Read-only SELECT. Passed the guard.</div></div>
<div class="foot">Text-to-SQL agent, Postgres, row-level security</div>
</body></html>`

const dir = await mkdtemp(join(tmpdir(), "og-"))
const file = join(dir, "og.html")
await writeFile(file, html)
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await page.goto(pathToFileURL(file).href)
await page.evaluate(() => document.fonts.ready)
await page.screenshot({ path: join(root, "public/og.png") })
await browser.close()
console.log("wrote public/og.png")
