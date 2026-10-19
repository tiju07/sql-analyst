import createClient, { type Middleware } from "openapi-fetch"

import { showBanner } from "@/lib/banners"

import type { components, paths } from "./schema"

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

const sessionAndBanners: Middleware = {
  async onResponse({ request, response }) {
    if (response.ok) return undefined
    if (response.status === 401 && !new URL(request.url).pathname.startsWith("/api/auth/")) {
      window.location.assign(loginUrl())
      return undefined
    }
    const body = (await response
      .clone()
      .json()
      .catch(() => null)) as ErrorBody | null
    if (body?.code) noticeFromError(body)
    return undefined
  },
}

export const api = createClient<paths>({ baseUrl: "", credentials: "same-origin" })
api.use(sessionAndBanners)

/** Throw ApiError for error responses so React Query sees failures. */
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.error !== undefined || result.data === undefined) {
    const body = result.error as Partial<ErrorBody> | undefined
    throw new ApiError(
      result.response.status,
      body?.code ?? "INTERNAL",
      body?.message ?? `Request failed (${result.response.status}).`,
      body?.retry_after_s ?? null,
    )
  }
  return result.data
}
