import type { Metadata } from "next"
import { Suspense } from "react"

import { ChatWorkspace } from "@/components/chat/ChatWorkspace"
import { EmptyIntro } from "@/components/chat/EmptyState"

export const metadata: Metadata = { title: "Ask" }

export default function AppPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
          <EmptyIntro />
        </div>
      }
    >
      <ChatWorkspace />
    </Suspense>
  )
}
