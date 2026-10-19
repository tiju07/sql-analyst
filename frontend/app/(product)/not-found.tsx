import Link from "next/link"

export default function ProductNotFound() {
  return (
    <main id="main" className="grid min-h-[60dvh] place-items-center px-6">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight">Not found</h1>
        <p className="text-muted-foreground mt-2">It may have been deleted, or it belongs to another account.</p>
        <Link href="/app" className="text-primary mt-5 inline-block font-medium underline-offset-4 hover:underline">
          Back to your conversations
        </Link>
      </div>
    </main>
  )
}
