import type { Viewport } from "next"

import "../globals.css"

import { RootDocument } from "@/components/layout/RootDocument"
import { SkipLink } from "@/components/layout/SkipLink"
import { baseMetadata, pageMetadata } from "@/lib/metadata"

export const metadata = { ...baseMetadata, ...pageMetadata({ path: "/" }) }

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#08090a" },
  ],
}

/** Marketing pages (/ and /evals): fully static in both build modes. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <RootDocument>
      <SkipLink />
      {children}
    </RootDocument>
  )
}
