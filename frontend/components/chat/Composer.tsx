"use client"

import { ArrowUp, Square } from "lucide-react"
import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export const QUESTION_MAX = 1000

export type ComposerHandle = { focus: () => void; fill: (text: string) => void }

export const Composer = forwardRef<
  ComposerHandle,
  { streaming: boolean; onSend: (q: string) => void; onStop: () => void; disabled?: boolean }
>(function Composer({ streaming, onSend, onStop, disabled }, ref) {
  const [value, setValue] = useState("")
  const area = useRef<HTMLTextAreaElement>(null)

  useImperativeHandle(ref, () => ({
    focus: () => area.current?.focus(),
    fill: (text) => {
      setValue(text)
      area.current?.focus()
    },
  }))

  // Grow with content up to ~8 lines, then scroll.
  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`
  }, [value])

  const trimmed = value.trim()
  const over = value.length > QUESTION_MAX
  const canSend = !streaming && !disabled && trimmed.length > 0 && !over

  function send() {
    if (!canSend) return
    onSend(trimmed)
    setValue("")
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        send()
      }}
      className="bg-surface focus-within:border-accent rounded-xl border p-2 shadow-xs transition-colors"
    >
      <label htmlFor="composer" className="sr-only">
        Ask a question about the data
      </label>
      <textarea
        id="composer"
        ref={area}
        rows={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            send()
          }
        }}
        placeholder="Ask about orders, revenue, deliveries, reviews…"
        aria-describedby="composer-hint composer-count"
        className="placeholder:text-fg-muted block max-h-[220px] w-full resize-none bg-transparent px-2 py-1.5 text-base outline-none sm:text-sm"
      />
      <div className="flex items-center justify-between gap-2 px-1 pt-1">
        <p id="composer-hint" className="text-fg-muted hidden text-xs sm:block">
          Enter to send, Shift+Enter for a new line
        </p>
        <p id="composer-count" className={cn("tabular ml-auto text-xs", over ? "text-danger" : "text-fg-muted")}>
          {value.length > QUESTION_MAX * 0.8 || over ? `${value.length}/${QUESTION_MAX}` : ""}
        </p>
        {streaming ? (
          <Button type="button" size="sm" variant="secondary" onClick={onStop}>
            <Square aria-hidden className="fill-current" />
            Stop
          </Button>
        ) : (
          <Button type="submit" size="icon-sm" disabled={!canSend} aria-label="Send question">
            <ArrowUp aria-hidden />
          </Button>
        )}
      </div>
    </form>
  )
})
