import { showBanner } from "@/lib/banners"

import type { components } from "./schema"

/** Types and error helpers shared by both build modes. No network code lives here. */
export type Schemas = components["schemas"]
export type ErrorBody = Schemas["ErrorBody"]
export type ErrorCode = ErrorBody["code"]

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly retryAfterS: number | null = null,
  ) {
    super(message)
  }
}

/** Where a signed-out user goes, remembering the page they were on. */
export function loginUrl(): string {
  const here = window.location.pathname + window.location.search
  return `/login?next=${encodeURIComponent(here)}`
}

export function noticeFromError(body: ErrorBody) {
  if (body.code === "RATE_LIMITED") {
    showBanner({
      kind: "rate_limited",
      until: Date.now() + (body.retry_after_s ?? 30) * 1000,
      message: body.message,
    })
  } else if (body.code === "BUDGET_EXCEEDED") {
    showBanner({ kind: "budget", message: body.message })
  }
}
