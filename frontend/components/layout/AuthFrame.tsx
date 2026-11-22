import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

import { ThemeToggle } from "@/components/layout/ThemeToggle"

/** Quiet frame for /login and /signup: a way home, the theme toggle, centred content. */
export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="container-x flex h-14 items-center justify-between">
        <Link href="/" className="text-fg-muted hover:text-fg inline-flex items-center gap-1.5 rounded-sm text-sm">
          <ArrowLeft aria-hidden className="size-4" />
          Home
        </Link>
        <ThemeToggle />
      </header>
      <main id="main" className="container-x grid flex-1 place-items-center py-12">
        {children}
      </main>
    </div>
  )
}
