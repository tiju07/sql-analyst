/**
 * SQL highlighting, loaded on demand. Core + JS regex engine: no WASM (no CSP exception) and
 * only the SQL grammar and two themes are bundled.
 */
import type { HighlighterCore, ThemedToken } from "shiki/core"

let highlighter: Promise<HighlighterCore> | null = null

function load(): Promise<HighlighterCore> {
  highlighter ??= (async () => {
    const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] = await Promise.all([
      import("shiki/core"),
      import("shiki/engine/javascript"),
    ])
    return createHighlighterCore({
      themes: [import("shiki/themes/github-light-default.mjs"), import("shiki/themes/github-dark-default.mjs")],
      langs: [import("shiki/langs/sql.mjs")],
      engine: createJavaScriptRegexEngine(),
    })
  })()
  return highlighter
}

export async function sqlTokens(code: string, dark: boolean): Promise<ThemedToken[][]> {
  const h = await load()
  return h.codeToTokensBase(code, { lang: "sql", theme: dark ? "github-dark-default" : "github-light-default" })
}
