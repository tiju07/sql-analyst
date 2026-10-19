import type { Metadata } from "next"
import { Suspense } from "react"

import { ChatWorkspace } from "@/components/chat/ChatWorkspace"

export const metadata: Metadata = { title: "Ask" }

export default function AppPage() {
  return (
    <Suspense>
      <ChatWorkspace />
    </Suspense>
  )
}
