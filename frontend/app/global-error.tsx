"use client"

import "./globals.css"

/** Last-resort boundary: replaces the root layout, so it brings its own <html>. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="grid min-h-dvh place-items-center px-6 font-sans">
        <main id="main" className="max-w-md text-center">
          <h1 className="text-2xl font-semibold tracking-tight">The app hit an unexpected error</h1>
          <p className="text-muted-foreground mt-3">
            Reload to try again. If it keeps happening, the reference below helps us find it.
          </p>
          {error.digest && <p className="text-muted-foreground mt-2 font-mono text-xs">Reference {error.digest}</p>}
          <button
            type="button"
            onClick={reset}
            className="bg-primary text-primary-foreground mt-6 rounded-md px-4 py-2 text-sm font-medium"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  )
}
