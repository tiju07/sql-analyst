// Local preview of the static export, close to Cloudflare Pages: directory URLs get a trailing
// slash, unknown paths get 404.html with status 404, and public/_headers is applied.
// Usage: node scripts/serve-static.mjs <dir> <port>
import { createReadStream } from "node:fs"
import { readFile, stat } from "node:fs/promises"
import { createServer } from "node:http"
import { extname, join, normalize, resolve } from "node:path"

const root = resolve(process.argv[2] ?? "out")
const port = Number(process.argv[3] ?? 3151)
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
}

/** Parse Cloudflare's _headers format: a URL pattern line, then indented "Name: value" lines. */
async function loadHeaders() {
  const rules = []
  const text = await readFile(join(root, "_headers"), "utf8").catch(() => "")
  for (const line of text.split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue
    if (!/^\s/.test(line)) rules.push({ pattern: line.trim(), headers: [] })
    else
      rules.at(-1)?.headers.push(
        line
          .trim()
          .split(/:\s*(.*)/s)
          .slice(0, 2),
      )
  }
  return rules.map((r) => ({
    ...r,
    re: new RegExp(`^${r.pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`),
  }))
}

const rules = await loadHeaders()

async function isFile(p) {
  return (await stat(p).catch(() => null))?.isFile() ?? false
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost")
  const path = decodeURIComponent(url.pathname)
  for (const r of rules) {
    if (!r.re.test(path)) continue
    // Plain-HTTP preview: browsers would try to upgrade localhost requests to HTTPS.
    for (const [k, v] of r.headers)
      res.setHeader(k, k === "Content-Security-Policy" ? v.replace(/;\s*upgrade-insecure-requests/, "") : v)
  }
  const target = normalize(join(root, path))
  if (!target.startsWith(root)) return void res.writeHead(400).end()
  let file = null
  if (await isFile(target)) file = target
  else if (await isFile(join(target, "index.html"))) {
    if (!path.endsWith("/")) return void res.writeHead(308, { Location: `${path}/${url.search}` }).end()
    file = join(target, "index.html")
  } else if (await isFile(`${target}.html`)) file = `${target}.html`
  const status = file ? 200 : 404
  file ??= join(root, "404.html")
  res.writeHead(status, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" })
  createReadStream(file).pipe(res)
}).listen(port, "127.0.0.1", () => console.log(`Serving ${root} on http://127.0.0.1:${port}`))
