import { SiteFooter, SiteNav, type SiteLink } from "@/design-system"
import { PRODUCT_NAME } from "@/lib/site"

/** Navigation and footer for the marketing pages. About me comes from the design system. */
const NAV: SiteLink[] = [
  { label: "Demo", href: "/#demo" },
  { label: "How it works", href: "/#how" },
  { label: "Features", href: "/#features" },
  { label: "FAQ", href: "/#faq" },
  { label: "Sign in", href: "/login/" },
]

const FOOTER: SiteLink[] = [
  { label: "Explore the app", href: "/app/" },
  { label: "Method", href: "/evals/" },
  { label: "Sign in", href: "/login/" },
]

export function MarketingNav() {
  return <SiteNav name={PRODUCT_NAME} links={NAV} cta={{ label: "Watch the demo", href: "/#demo" }} />
}

export function MarketingFooter() {
  return (
    <SiteFooter
      name={PRODUCT_NAME}
      tagline="Plain-English questions over a Postgres database, answered with checked, read-only SQL."
      links={FOOTER}
    />
  )
}
