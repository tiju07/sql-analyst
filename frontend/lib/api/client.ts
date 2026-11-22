import createClient, { type Middleware } from "openapi-fetch"

import { ApiError, loginUrl, noticeFromError, type ErrorBody } from "./errors"
import type { paths } from "./schema"

export { ApiError, loginUrl, noticeFromError, type ErrorBody, type ErrorCode, type Schemas } from "./errors"

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
