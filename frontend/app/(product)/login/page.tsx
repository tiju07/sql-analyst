import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { LoginForm } from "@/components/auth/LoginForm"
import { PRODUCT_NAME } from "@/lib/site"

export const metadata: Metadata = { title: "Sign in" }

export default function LoginPage() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-4xl items-center px-4 py-5 sm:px-6">
        <Link href="/" className="font-semibold tracking-tight">
          {PRODUCT_NAME}
        </Link>
      </header>
      <main id="main" className="mx-auto max-w-4xl px-4 pt-6 pb-16 sm:px-6 sm:pt-10">
        <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-muted-foreground mt-2 max-w-prose">
          The demo runs on the public Olist dataset. Queries are read-only and every answer shows its SQL.
        </p>
        <div className="mt-10">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </main>
    </div>
  )
}
