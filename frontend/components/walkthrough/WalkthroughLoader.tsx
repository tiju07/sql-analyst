"use client"

import { useEffect, useState, type ComponentType } from "react"

/**
 * The walkthrough loads after the hero has painted, into a box of the same size, so the headline
 * and buttons are never held up by it and nothing shifts when it arrives. A plain import() in an
 * effect (rather than next/dynamic) keeps its chunk out of the page's preload list.
 */
export function WalkthroughLoader() {
  const [Walkthrough, setWalkthrough] = useState<ComponentType | null>(null)
  useEffect(() => {
    let live = true
    void import("./ProductWalkthrough").then((m) => live && setWalkthrough(() => m.ProductWalkthrough))
    return () => {
      live = false
    }
  }, [])
  if (Walkthrough) return <Walkthrough />
  return (
    <div aria-hidden className="grid gap-4">
      <div className="border-line-strong bg-bg aspect-[420/700] w-full rounded-xl border sm:aspect-[1120/680]" />
      <div className="h-[132px] md:h-[92px]" />
    </div>
  )
}
