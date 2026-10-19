"use client"

import { useSyncExternalStore } from "react"

/** App-wide notices that outlive a single answer (rate limit countdown, budget pause). */
export type Banner = { kind: "rate_limited"; until: number; message: string } | { kind: "budget"; message: string }

let banner: Banner | null = null
const listeners = new Set<() => void>()

export function showBanner(next: Banner | null) {
  banner = next
  listeners.forEach((l) => l())
}

export function useBanner(): Banner | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => banner,
    () => null,
  )
}
