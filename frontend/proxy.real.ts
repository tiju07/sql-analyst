import { NextResponse, type NextRequest } from "next/server"

import { nonceCsp } from "@/lib/csp"

const SESSION_COOKIE = "sa_session"

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  // Cheap gate: no cookie means certainly signed out. The API still validates every request;
  // an expired cookie is caught client-side (401 -> /login?next=...).
  if (pathname.startsWith("/app") && !request.cookies.has(SESSION_COOKIE)) {
    const login = new URL("/login", request.url)
    login.searchParams.set("next", pathname + search)
    return NextResponse.redirect(login)
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64")
  const csp = nonceCsp(nonce)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-nonce", nonce)
  requestHeaders.set("Content-Security-Policy", csp)
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set("Content-Security-Policy", csp)
  return response
}

export const config = {
  matcher: [
    {
      source: "/(login|app|runs)/:path*",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
}
