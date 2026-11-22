import type { Metadata } from "next"

import { PRODUCT_NAME, SITE_URL, TAGLINE } from "@/lib/site"

/** Title, description, canonical URL and Open Graph tags for one page. Paths end in a slash. */
export function pageMetadata({
  title,
  description = TAGLINE,
  path,
  index = true,
}: {
  title?: string
  description?: string
  path: string
  index?: boolean
}): Metadata {
  const full = title ? `${title} | ${PRODUCT_NAME}` : `${PRODUCT_NAME}: plain-English questions, safe SQL answers`
  return {
    title: full,
    description,
    alternates: { canonical: path },
    robots: index ? undefined : { index: false, follow: true },
    openGraph: {
      type: "website",
      siteName: PRODUCT_NAME,
      title: full,
      description,
      url: path,
      images: [{ url: "/og.png", width: 1200, height: 630, alt: `${PRODUCT_NAME} product walkthrough` }],
    },
    twitter: { card: "summary_large_image", title: full, description, images: ["/og.png"] },
  }
}

export const baseMetadata: Metadata = { metadataBase: new URL(SITE_URL) }
