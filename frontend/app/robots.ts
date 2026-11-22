import type { MetadataRoute } from "next"

import { IS_STATIC, SITE_URL } from "@/lib/site"

export const dynamic = "force-static"

export default function robots(): MetadataRoute.Robots {
  // The static demo workspace is public; the real product keeps /app and the API private.
  const disallow = IS_STATIC ? ["/login/", "/signup/", "/runs/"] : ["/app", "/runs", "/api", "/login"]
  return { rules: [{ userAgent: "*", allow: "/", disallow }], sitemap: `${SITE_URL}/sitemap.xml` }
}
