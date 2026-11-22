"use client"

import { Check, ChevronDown, Copy } from "lucide-react"
import { useResolvedTheme } from "@/lib/theme"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import type { ThemedToken } from "shiki/core"

import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { sqlTokens } from "@/lib/highlight"

/** Highlighted SQL as React text nodes: model output is never injected as HTML. */
export function SqlCode({ sql }: { sql: string }) {
  const resolvedTheme = useResolvedTheme()
  const [tokens, setTokens] = useState<ThemedToken[][] | null>(null)
  useEffect(() => {
    let live = true
    sqlTokens(sql, resolvedTheme === "dark")
      .then((t) => live && setTokens(t))
      .catch(() => live && setTokens(null))
    return () => {
      live = false
    }
  }, [sql, resolvedTheme])
  return (
    <pre
      tabIndex={0}
      aria-label="SQL"
      className="border-line bg-bg-subtle text-fg-2 overflow-x-auto rounded-md border p-3 font-mono text-[13px] leading-relaxed"
    >
      <code>
        {tokens
          ? tokens.map((line, i) => (
              <span key={i} className="block">
                {line.map((t, j) => (
                  <span key={j} style={{ color: t.color }}>
                    {t.content}
                  </span>
                ))}
                {line.length === 0 && "\n"}
              </span>
            ))
          : sql}
      </code>
    </pre>
  )
}

export function CopyButton({ text, label = "Copy SQL" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          toast.success("SQL copied")
          setTimeout(() => setCopied(false), 1500)
        } catch {
          toast.error("Copy failed. Select the text and copy it manually.")
        }
      }}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      {copied ? "Copied" : label}
    </Button>
  )
}

export function SqlBlock({ sql, defaultOpen = false }: { sql: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center justify-between gap-2">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="-ml-2">
            <ChevronDown aria-hidden className={open ? "rotate-180 transition-transform" : "transition-transform"} />
            {open ? "Hide SQL" : "Show SQL"}
          </Button>
        </CollapsibleTrigger>
        <CopyButton text={sql} />
      </div>
      <CollapsibleContent className="mt-2">
        <SqlCode sql={sql} />
      </CollapsibleContent>
    </Collapsible>
  )
}
