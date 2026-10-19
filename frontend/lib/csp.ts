/** Content-Security-Policy builders shared by next.config (static pages) and proxy.ts. */

const isDev = process.env.NODE_ENV === "development"
// Only upgrade subresources when the site is served over HTTPS (local compose is plain HTTP).
const upgrade = (process.env.SITE_URL ?? "").startsWith("https://")

function join(directives: string[]): string {
  return [...directives, ...(upgrade ? ["upgrade-insecure-requests"] : [])].join("; ")
}

const common = [
  "default-src 'self'",
  // Sonner and CodeMirror inject <style> elements at runtime without a nonce; scripts stay strict.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
]

/** Dynamic routes: per-request nonce; 'strict-dynamic' lets nonce'd chunks load their imports. */
export function nonceCsp(nonce: string): string {
  return join([...common, `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`])
}

/**
 * Static routes (/ and /evals) are prerendered, so no per-request nonce exists, and the App
 * Router emits inline flight-data scripts on every page. These pages render no user or model
 * content; 'unsafe-inline' is limited to them.
 */
export function staticCsp(): string {
  return join([...common, `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`])
}
