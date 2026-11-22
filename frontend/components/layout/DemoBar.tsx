import { Info } from "lucide-react"
import Link from "next/link"

/** Shown on every Explore screen of the static demo. */
export function DemoBar() {
  return (
    <div
      role="note"
      className="border-line bg-accent-soft text-fg-2 flex min-h-9 shrink-0 items-center gap-2 border-b px-3 py-1.5 text-[13px] sm:px-5"
    >
      <Info aria-hidden className="text-accent-ink size-4 shrink-0" />
      <p className="min-w-0 flex-1">
        <span className="text-fg font-medium">Demo workspace, simulated data.</span>{" "}
        <span className="hidden sm:inline">
          Answers are scripted from real Olist query results. Nothing you do is saved.
        </span>
      </p>
      <Link href="/" className="text-accent-ink shrink-0 font-medium underline-offset-4 hover:underline">
        Back to the tour
      </Link>
    </div>
  )
}
