/** Product name lives here only (backend: app/config.py PRODUCT_NAME). */
export const PRODUCT_NAME = "SQL Analyst"
export const IS_STATIC = process.env.NEXT_PUBLIC_DEMO === "static"
/** Canonical origin. The static build defaults to the planned Cloudflare Pages address. */
export const SITE_URL = process.env.SITE_URL ?? (IS_STATIC ? "https://sql-analyst.pages.dev" : "http://localhost:8080")
export const TAGLINE = "Ask a business database a question in plain English. Get the SQL, the numbers, and a chart."
