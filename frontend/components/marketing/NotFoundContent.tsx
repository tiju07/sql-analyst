import Link from "next/link"

import { AboutMeLink, ButtonLink } from "@/components/marketing/links"
import { Logo } from "@/design-system"
import { PRODUCT_NAME } from "@/lib/site"

export function NotFoundContent() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="container-x flex h-14 items-center">
        <Link href="/" aria-label={`${PRODUCT_NAME} home`} className="rounded-sm">
          <Logo name={PRODUCT_NAME} />
        </Link>
      </header>
      <main id="main" className="container-x grid flex-1 place-items-center py-16">
        <div className="grid max-w-md justify-items-center gap-4 text-center">
          <span className="label">404</span>
          <h1 className="text-3xl tracking-tight">This page does not exist</h1>
          <p className="text-fg-2 text-pretty">
            The link may be old, or the address mistyped. Start from the home page or open the demo workspace.
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/">Home</ButtonLink>
            <ButtonLink href="/app/" variant="outline">
              Explore the app
            </ButtonLink>
          </div>
          <AboutMeLink className="text-fg-muted hover:text-fg mt-4 inline-flex items-center gap-1 text-sm" />
        </div>
      </main>
    </div>
  )
}
