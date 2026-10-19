"use client"

import { useQuery } from "@tanstack/react-query"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { AnswerCard } from "@/components/chat/AnswerCard"
import { Composer, type ComposerHandle } from "@/components/chat/Composer"
import { EmptyState } from "@/components/chat/EmptyState"
import { Inspector } from "@/components/inspector/Inspector"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { fromRun, type Answer } from "@/lib/answer"
import { api, unwrap } from "@/lib/api/client"
import { keys } from "@/lib/api/queries"
import { useChatStream } from "@/lib/hooks/useChatStream"
import { FOCUS_COMPOSER } from "@/lib/hooks/useHotkeys"
import { useMediaQuery } from "@/lib/hooks/useMediaQuery"

function Question({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="bg-secondary max-w-[85%] rounded-2xl rounded-br-md px-4 py-2 break-words whitespace-pre-wrap">
        {text}
      </p>
    </div>
  )
}

export function ChatWorkspace() {
  const router = useRouter()
  const params = useSearchParams()
  const urlConversation = params.get("c") ?? undefined
  const [conversationId, setConversationId] = useState<string | undefined>(urlConversation)
  const [inspecting, setInspecting] = useState<string | null>(null)
  const composer = useRef<ComposerHandle>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const desktop = useMediaQuery("(min-width: 1024px)")
  const tablet = useMediaQuery("(min-width: 640px)")

  const onConversation = useCallback((id: string) => {
    setConversationId(id)
    // Update the address without remounting: the stream that created it keeps running.
    window.history.replaceState(null, "", `/app?c=${id}`)
  }, [])
  const chat = useChatStream({ conversationId, onConversation })

  // Navigating to another conversation (or New chat) resets the live answers. Adjusting state
  // during render when an input changes is React's recommended alternative to an effect here.
  const [seenUrl, setSeenUrl] = useState(urlConversation)
  if (urlConversation !== seenUrl) {
    setSeenUrl(urlConversation)
    if (urlConversation !== conversationId) {
      setConversationId(urlConversation)
      setInspecting(null)
      chat.reset()
    }
  }

  const history = useQuery({
    queryKey: keys.conversation(conversationId ?? ""),
    queryFn: async () =>
      unwrap(
        await api.GET("/api/conversations/{conv_id}", { params: { path: { conv_id: conversationId as string } } }),
      ),
    enabled: Boolean(conversationId),
  })

  useEffect(() => {
    if (history.isError) router.replace("/app")
  }, [history.isError, router])

  const answers: Answer[] = useMemo(() => {
    const live = new Set(chat.answers.map((a) => a.runId).filter(Boolean))
    const saved = (history.data?.runs ?? []).filter((r) => !live.has(r.id)).map((r) => fromRun(r))
    return [...saved, ...chat.answers]
  }, [chat.answers, history.data])

  useEffect(() => {
    const focus = () => composer.current?.focus()
    window.addEventListener(FOCUS_COMPOSER, focus)
    return () => window.removeEventListener(FOCUS_COMPOSER, focus)
  }, [])

  const count = chat.answers.length
  useEffect(() => {
    if (count) bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [count])

  const conversation = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {conversationId && history.isPending ? (
          <div className="mx-auto max-w-3xl space-y-4 px-4 py-8">
            <Skeleton className="ml-auto h-10 w-1/2" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : answers.length === 0 ? (
          <EmptyState onPick={(q) => void chat.ask(q)} />
        ) : (
          <div className="mx-auto max-w-3xl space-y-10 px-4 py-6 sm:py-8">
            {answers.map((a) => (
              <section key={a.key} className="space-y-4">
                <Question text={a.question} />
                <AnswerCard
                  answer={a}
                  live={chat.answers.some((x) => x.key === a.key)}
                  busy={chat.streaming}
                  onClarify={(reply) => void chat.clarify(a, reply)}
                  onInspect={() => a.runId && setInspecting(a.runId)}
                  onRerun={() => void chat.ask(a.question)}
                />
              </section>
            ))}
            <div ref={bottom} />
          </div>
        )}
      </div>
      <div
        className="mx-auto w-full max-w-3xl px-3 pt-2 sm:px-4"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <Composer
          ref={composer}
          streaming={chat.streaming}
          onSend={(q) => void chat.ask(q)}
          onStop={() => void chat.stop()}
        />
      </div>
    </div>
  )

  if (desktop && inspecting) {
    return (
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel minSize={420}>{conversation}</ResizablePanel>
        <ResizableHandle withHandle aria-label="Resize inspector" />
        <ResizablePanel defaultSize={420} minSize={320} maxSize={720}>
          <aside aria-label="Inspector" className="bg-card h-full overflow-y-auto border-l">
            <div className="flex justify-end px-2 pt-2">
              <button
                className="text-muted-foreground hover:text-foreground rounded-md px-2 py-1 text-sm"
                onClick={() => setInspecting(null)}
              >
                Close
              </button>
            </div>
            <Inspector runId={inspecting} />
          </aside>
        </ResizablePanel>
      </ResizablePanelGroup>
    )
  }

  return (
    <>
      {conversation}
      {!desktop && (
        <Sheet open={inspecting !== null} onOpenChange={(o) => !o && setInspecting(null)}>
          <SheetContent
            side={tablet ? "right" : "bottom"}
            className={
              tablet
                ? "w-[440px] overflow-y-auto p-0 sm:max-w-[440px]"
                : "max-h-[85dvh] overflow-y-auto rounded-t-2xl p-0"
            }
          >
            <SheetHeader className="pb-0">
              <SheetTitle>Inspector</SheetTitle>
              <SheetDescription>Queries, context and timing for this answer</SheetDescription>
            </SheetHeader>
            <Inspector runId={inspecting} />
          </SheetContent>
        </Sheet>
      )}
    </>
  )
}
