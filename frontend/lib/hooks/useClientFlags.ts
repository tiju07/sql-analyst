"use client"

import { useSyncExternalStore } from "react"

const noop = () => () => {}

/** True after hydration; avoids rendering client-only values (like the theme) on the server. */
export function useMounted(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  )
}

const EVENT = "sql-analyst:local-storage"

/** A boolean persisted in localStorage, safe when storage is blocked. */
export function usePersistentFlag(key: string): [boolean, (v: boolean) => void] {
  const value = useSyncExternalStore(
    (l) => {
      window.addEventListener(EVENT, l)
      window.addEventListener("storage", l)
      return () => {
        window.removeEventListener(EVENT, l)
        window.removeEventListener("storage", l)
      }
    },
    () => {
      try {
        return localStorage.getItem(key) === "1"
      } catch {
        return false
      }
    },
    () => false,
  )
  function set(v: boolean) {
    try {
      localStorage.setItem(key, v ? "1" : "0")
    } catch {
      // storage blocked (private mode): the flag just won't persist
    }
    window.dispatchEvent(new Event(EVENT))
  }
  return [value, set]
}
