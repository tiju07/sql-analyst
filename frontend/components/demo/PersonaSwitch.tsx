"use client"

import { useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useId, useSyncExternalStore } from "react"

import { PERSONA_BLURB, PERSONAS, type PersonaKey } from "@/fixtures/workspace"
import { demo } from "@/lib/demo/instance"

/** "View as": swaps the demo persona to show roles and row-level security. */
export function PersonaSwitch({ compact = false, onDone }: { compact?: boolean; onDone?: () => void }) {
  const id = useId()
  const qc = useQueryClient()
  const router = useRouter()
  const persona = useSyncExternalStore(demo.subscribe, demo.persona, demo.persona)
  if (compact) return null
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="label">
        View as
      </label>
      <select
        id={id}
        value={persona}
        onChange={(e) => {
          demo.setPersona(e.target.value as PersonaKey)
          qc.clear()
          router.push("/app/")
          onDone?.()
        }}
        className="border-line-strong bg-surface text-fg focus:border-accent h-9 w-full rounded-md border px-2 text-[13px] focus:outline-none"
        aria-describedby={`${id}-blurb`}
      >
        {(Object.keys(PERSONAS) as PersonaKey[]).map((k) => (
          <option key={k} value={k}>
            {PERSONAS[k].display_name}
          </option>
        ))}
      </select>
      <p id={`${id}-blurb`} className="text-fg-muted text-xs leading-snug">
        {PERSONA_BLURB[persona]}
      </p>
    </div>
  )
}
