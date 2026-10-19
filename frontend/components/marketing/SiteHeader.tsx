import Link from "next/link"

import { PRODUCT_NAME, REPO_URL } from "@/lib/site"

export function SiteHeader() {
  return (
    <header className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-5 sm:px-6">
      <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
        <span
          aria-hidden
          className="bg-primary text-primary-foreground grid size-6 place-items-center rounded-md font-mono text-xs"
        >
          Σ
        </span>
        {PRODUCT_NAME}
      </Link>
      <nav aria-label="Site" className="ml-auto flex items-center gap-1 text-sm sm:gap-4">
        <Link href="/evals" className="hover:bg-accent rounded-md px-2 py-2">
          Evals
        </Link>
        <a href={REPO_URL} className="hover:bg-accent rounded-md px-2 py-2">
          GitHub
        </a>
        <Link href="/login" className="bg-primary text-primary-foreground rounded-md px-3 py-2 font-medium">
          Sign in
        </Link>
      </nav>
    </header>
  )
}
