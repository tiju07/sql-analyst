"use client"

import { useQueryClient } from "@tanstack/react-query"
import { LogOut, UserRound } from "lucide-react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { api } from "@/lib/api/client"
import { useMe } from "@/lib/api/queries"
import { ROLE_LABEL, scopeLabel } from "@/lib/personas"

export function UserMenu({ compact = false }: { compact?: boolean }) {
  const me = useMe()
  const router = useRouter()
  const qc = useQueryClient()
  async function signOut() {
    await api.POST("/api/auth/logout")
    qc.clear() // no cached data from this account survives sign-out
    router.replace("/login")
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={compact ? "icon-sm" : "sm"}
          className={compact ? undefined : "w-full justify-start"}
          aria-label={compact ? "Account" : undefined}
        >
          <UserRound aria-hidden />
          {!compact && <span className="truncate">{me.data?.display_name ?? "Account"}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {me.data && (
          <DropdownMenuLabel className="font-normal">
            <p className="font-medium">{me.data.display_name}</p>
            <p className="text-fg-muted text-xs">
              {ROLE_LABEL[me.data.role]}, {scopeLabel(me.data.allowed_states).toLowerCase()}
            </p>
          </DropdownMenuLabel>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut}>
          <LogOut aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
