import type { Viewport } from "next"
import { headers } from "next/headers"

import "../globals.css"

import { Providers } from "@/components/layout/Providers"
import { RootDocument } from "@/components/layout/RootDocument"
import { SkipLink } from "@/components/layout/SkipLink"
import { baseMetadata, pageMetadata } from "@/lib/metadata"
import { IS_STATIC } from "@/lib/site"

// The real product is private; the static demo workspace is public and indexable.
export const metadata = { ...baseMetadata, ...pageMetadata({ title: "Explore", path: "/app/", index: IS_STATIC }) }

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // lets the composer respect safe-area insets on notched phones
  interactiveWidget: "resizes-content", // the on-screen keyboard shrinks the layout, not overlays it
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#08090a" },
  ],
}

/**
 * Product pages. Real mode: dynamic, with the per-request CSP nonce from proxy.real.ts.
 * Static mode: prerendered, no request headers exist.
 */
export default async function ProductLayout({ children }: { children: React.ReactNode }) {
  const nonce = IS_STATIC ? undefined : ((await headers()).get("x-nonce") ?? undefined)
  return (
    <RootDocument nonce={nonce}>
      <Providers>
        <SkipLink />
        {children}
      </Providers>
    </RootDocument>
  )
}
