import { RunView } from "@/components/chat/RunView"
import { HISTORY, seedRunId } from "@/fixtures/workspace"
import { pageMetadata } from "@/lib/metadata"
import { IS_STATIC } from "@/lib/site"

export const metadata = pageMetadata({ title: "Answer", path: "/runs/", index: false })

/** Static export: one page per seeded demo run. Real mode: any id, rendered on request. */
export function generateStaticParams() {
  if (!IS_STATIC) return []
  return Object.values(HISTORY).flatMap((list) =>
    list.flatMap((c) => c.questions.map((_, i) => ({ id: seedRunId(c.id, i) }))),
  )
}

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <RunView runId={id} />
}
