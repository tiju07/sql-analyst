"use client"

import { MessageCircleQuestion } from "lucide-react"
import { useId, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function ClarifyCard({
  question,
  options,
  answered,
  disabled,
  onAnswer,
}: {
  question: string
  options: string[]
  answered?: string | null
  disabled: boolean
  onAnswer: (answer: string) => void
}) {
  const [text, setText] = useState("")
  const id = useId()
  if (answered) {
    return (
      <p className="text-fg-muted flex items-start gap-2 text-sm">
        <MessageCircleQuestion aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>
          {question} <span className="text-fg font-medium">{answered}</span>
        </span>
      </p>
    )
  }
  return (
    <section aria-labelledby={id} className="border-accent/40 bg-accent-soft/50 rounded-lg border p-4">
      <h3 id={id} className="flex items-start gap-2 font-medium">
        <MessageCircleQuestion aria-hidden className="text-accent-ink mt-0.5 size-4 shrink-0" />
        {question}
      </h3>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Suggested answers">
        {options.map((o) => (
          <Button key={o} variant="outline" size="sm" disabled={disabled} onClick={() => onAnswer(o)}>
            {o}
          </Button>
        ))}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (text.trim()) onAnswer(text.trim())
        }}
      >
        <label htmlFor={`${id}-other`} className="sr-only">
          Or type your own answer
        </label>
        <Input
          id={`${id}-other`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Or type your own answer"
          maxLength={500}
          disabled={disabled}
        />
        <Button type="submit" variant="secondary" disabled={disabled || !text.trim()}>
          Answer
        </Button>
      </form>
    </section>
  )
}
