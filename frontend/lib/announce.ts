"use client"

import { useSyncExternalStore } from "react"

/** One polite live region for the whole app: stage progress and completion. */
let message = ""
const listeners = new Set<() => void>()

export function announce(text: string) {
  // Re-announce identical text by clearing first.
  message = ""
  listeners.forEach((l) => l())
  queueMicrotask(() => {
    message = text
    listeners.forEach((l) => l())
  })
}

export function useAnnouncement(): string {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => message,
    () => "",
  )
}
