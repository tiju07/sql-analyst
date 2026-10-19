import type { Metadata } from "next"

import { RunView } from "@/components/chat/RunView"

export const metadata: Metadata = { title: "Answer" }

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <RunView runId={id} />
}
