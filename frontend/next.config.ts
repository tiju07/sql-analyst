import type { NextConfig } from "next"

import { staticCsp } from "./lib/csp"

/**
 * Two build modes share one codebase:
 * - real (default): the full stack behind Caddy, `output: "standalone"`, proxy.real.ts for the
 *   per-request CSP nonce and the auth redirect, /api rewrites for local dev.
 * - static (NEXT_PUBLIC_DEMO=static, used by `pnpm build:static`): a plain static export to out/
 *   for Cloudflare Pages. No server code, no API calls; every request is answered from fixtures.
 *
 * The `app-mode` import is the single seam between the two: it resolves to lib/mode/real.tsx or
 * lib/mode/static.tsx, so the other mode's code (the real API client and login, or the demo data)
 * never reaches the bundle.
 */
const isStatic = process.env.NEXT_PUBLIC_DEMO === "static"

const securityHeaders = [
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
  // Ignored by browsers over plain HTTP, enforced once Caddy serves the domain over HTTPS.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
]

const realMode: NextConfig = {
  output: "standalone",
  // proxy.real.ts is only picked up in real mode; a static export cannot have a proxy.
  pageExtensions: ["tsx", "ts", "real.ts"],
  async headers() {
    const csp = [{ key: "Content-Security-Policy", value: staticCsp() }]
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/", headers: csp },
      { source: "/evals", headers: csp },
    ]
  },
  // Local `pnpm dev` without Caddy: forward /api to the stack. In compose, Caddy does this.
  async rewrites() {
    const target = process.env.API_PROXY_TARGET
    return target ? [{ source: "/api/:path*", destination: `${target}/api/:path*` }] : []
  },
}

// Security headers for the static site live in public/_headers (Cloudflare Pages reads it).
const staticMode: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  pageExtensions: ["tsx", "ts"],
}

const nextConfig: NextConfig = {
  ...(isStatic ? staticMode : realMode),
  poweredByHeader: false,
  reactStrictMode: true,
  // Cache Components (partial prerendering) can't coexist with per-request CSP nonces.
  cacheComponents: false,
  partialPrefetching: false,
  experimental: {
    // Two root layouts (static site vs nonce-protected product) need a routing-level 404.
    globalNotFound: true,
  },
  turbopack: {
    resolveAlias: {
      "app-mode": isStatic ? "./lib/mode/static.tsx" : "./lib/mode/real.tsx",
    },
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
}

export default nextConfig
