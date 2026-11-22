"use client"

import { Button } from "@/components/ui/button"

export default function ProductError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="grid min-h-[60dvh] place-items-center px-6">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-medium tracking-tight">This page failed to load</h1>
        <p className="text-fg-muted mt-2">Usually a network hiccup. Try again; your conversations are saved.</p>
        {error.digest && <p className="text-fg-muted mt-2 font-mono text-xs">Reference {error.digest}</p>}
        <Button className="mt-5" onClick={reset}>
          Try again
        </Button>
      </div>
    </main>
  )
}
