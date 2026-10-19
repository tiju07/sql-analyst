import type { Metadata, Viewport } from "next"

import "../globals.css"

import { SkipLink } from "@/components/layout/SkipLink"
import { ThemeProvider } from "@/components/layout/ThemeProvider"
import { fontVars } from "@/lib/fonts"
import { PRODUCT_NAME, SITE_URL, TAGLINE } from "@/lib/site"

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${PRODUCT_NAME}: plain-English questions, real SQL answers`, template: `%s | ${PRODUCT_NAME}` },
  description: TAGLINE,
  openGraph: { type: "website", siteName: PRODUCT_NAME, title: PRODUCT_NAME, description: TAGLINE },
  twitter: { card: "summary_large_image", title: PRODUCT_NAME, description: TAGLINE },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1115" },
  ],
}

/** Static marketing pages (/ and /evals): prerendered, no per-request nonce. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fontVars} antialiased`} suppressHydrationWarning>
      <body className="min-h-dvh">
        <ThemeProvider>
          <SkipLink />
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
