"use client"

import { AlertTriangle, CloudOff, Hourglass } from "lucide-react"
import { useEffect, useState, useSyncExternalStore } from "react"

import { useAnnouncement } from "@/lib/announce"
import { showBanner, useBanner } from "@/lib/banners"

function useOnline(): boolean {
  return useSyncExternalStore(
    (l) => {
      window.addEventListener("online", l)
      window.addEventListener("offline", l)
      return () => {
        window.removeEventListener("online", l)
        window.removeEventListener("offline", l)
      }
    },
    () => navigator.onLine,
    () => true,
  )
}

function Countdown({ until }: { until: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const left = Math.max(0, Math.ceil((until - now) / 1000))
  useEffect(() => {
    if (left === 0) showBanner(null)
  }, [left])
  return <span className="tabular font-medium">{left} s</span>
}

/** Global banners (offline, rate limit, demo budget) and the app's single polite live region. */
export function Notices() {
  const online = useOnline()
  const banner = useBanner()
  const announcement = useAnnouncement()
  return (
    <>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
      <div className="fixed inset-x-0 top-0 z-50 flex flex-col">
        {!online && (
          <p role="status" className="bg-fg text-bg flex items-center justify-center gap-2 px-4 py-2 text-sm">
            <CloudOff aria-hidden className="size-4" />
            You are offline. Answers will resume when the connection is back.
          </p>
        )}
        {banner?.kind === "rate_limited" && (
          <p role="status" className="bg-warning flex items-center justify-center gap-2 px-4 py-2 text-sm text-white">
            <Hourglass aria-hidden className="size-4" />
            You are asking faster than the demo allows. Try again in <Countdown until={banner.until} />.
          </p>
        )}
        {banner?.kind === "budget" && (
          <p role="status" className="bg-danger flex items-center justify-center gap-2 px-4 py-2 text-sm text-white">
            <AlertTriangle aria-hidden className="size-4" />
            {banner.message}
          </p>
        )}
      </div>
    </>
  )
}
