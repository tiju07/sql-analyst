import type { Metadata } from "next"
import Link from "next/link"

import "./globals.css"

import { fontVars } from "@/lib/fonts"
import { PRODUCT_NAME } from "@/lib/site"

export const metadata: Metadata = { title: `Page not found | ${PRODUCT_NAME}` }

export default function GlobalNotFound() {
  return (
    <html lang="en" className={`${fontVars} antialiased`}>
      <body className="grid min-h-dvh place-items-center px-6">
        <main id="main" className="max-w-md text-center">
          <p className="text-muted-foreground tabular text-sm">404</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">This page doesn&apos;t exist</h1>
          <p className="text-muted-foreground mt-3">
            The link may be old, or the address mistyped. Start from the home page or open the app.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/" className="text-primary font-medium underline-offset-4 hover:underline">
              Home
            </Link>
            <Link href="/app" className="text-primary font-medium underline-offset-4 hover:underline">
              Open the app
            </Link>
          </div>
        </main>
      </body>
    </html>
  )
}
