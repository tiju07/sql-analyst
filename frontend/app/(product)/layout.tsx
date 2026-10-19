import type { Metadata, Viewport } from "next"
import { headers } from "next/headers"

import "../globals.css"

import { Providers } from "@/components/layout/Providers"
import { SkipLink } from "@/components/layout/SkipLink"
import { fontVars } from "@/lib/fonts"
import { PRODUCT_NAME, SITE_URL } from "@/lib/site"

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: PRODUCT_NAME, template: `%s | ${PRODUCT_NAME}` },
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // lets the composer respect safe-area insets on notched phones
  interactiveWidget: "resizes-content", // the on-screen keyboard shrinks the layout, not overlays it
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1115" },
  ],
}

/** Product pages: dynamic, with the per-request CSP nonce from proxy.ts. */
export default async function ProductLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined
  return (
    <html lang="en" className={`${fontVars} antialiased`} suppressHydrationWarning>
      <body className="min-h-dvh">
        <Providers nonce={nonce}>
          <SkipLink />
          {children}
        </Providers>
      </body>
    </html>
  )
}
