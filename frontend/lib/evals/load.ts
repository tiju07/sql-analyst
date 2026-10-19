import "server-only"

import { readFile } from "node:fs/promises"
import path from "node:path"

import type { EvalSummary } from "./types"

/** Read at build time by the static pages. Absent file = no benchmark has been run yet. */
export async function loadEvalSummary(): Promise<EvalSummary | null> {
  try {
    const raw = await readFile(path.join(process.cwd(), "lib/evals/summary.json"), "utf8")
    return JSON.parse(raw) as EvalSummary
  } catch {
    return null
  }
}
