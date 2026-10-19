import type { NextConfig } from "next"

import { staticCsp } from "./lib/csp"

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

const nextConfig: NextConfig = {
  output: "standalone",
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
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
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

export default nextConfig
