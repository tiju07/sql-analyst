import type { MetadataRoute } from "next"

import { IS_STATIC, SITE_URL } from "@/lib/site"

export const dynamic = "force-static"

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = IS_STATIC ? ["/", "/evals/", "/app/", "/app/catalog/", "/app/verified/"] : ["/", "/evals"]
  return pages.map((p) => ({ url: `${SITE_URL}${p}`, changeFrequency: "monthly", priority: p === "/" ? 1 : 0.7 }))
}
