import { request, type FullConfig } from "@playwright/test"

export const PERSONAS = ["admin", "analyst", "regional"] as const
export const stateFile = (p: string) => `tests/e2e/artifacts/.auth/${p}.json`

/** Demo login is rate-limited per IP, so sign each persona in once and share the cookies. */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL as string
  for (const persona of PERSONAS) {
    const ctx = await request.newContext({ baseURL })
    const res = await ctx.post(`/api/auth/demo/${persona}`)
    if (!res.ok()) throw new Error(`demo login ${persona} failed: ${res.status()} ${await res.text()}`)
    await ctx.storageState({ path: stateFile(persona) })
    await ctx.dispose()
  }
}
