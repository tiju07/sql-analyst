"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useQuery } from "@tanstack/react-query"
import { Building2, MapPin, ShieldCheck } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { api, unwrap } from "@/lib/api/client"
import { keys } from "@/lib/api/queries"
import { safeNext } from "@/lib/safe-next"

const schema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
})
type Values = z.infer<typeof schema>

const ICONS = { admin: ShieldCheck, analyst: Building2, regional: MapPin } as const

export function LoginForm() {
  const next = safeNext(useSearchParams().get("next"))
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const personas = useQuery({
    queryKey: keys.personas,
    queryFn: async () => unwrap(await api.GET("/api/auth/personas")),
  })
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } })

  async function demo(persona: "admin" | "analyst" | "regional") {
    setBusy(persona)
    setError(null)
    const res = await api.POST("/api/auth/demo/{persona}", { params: { path: { persona } } })
    if (res.response.ok) window.location.assign(next)
    else {
      setError(res.error?.message ?? "Demo sign-in failed. Try again.")
      setBusy(null)
    }
  }

  async function submit(values: Values) {
    setBusy("password")
    setError(null)
    const res = await api.POST("/api/auth/login", { body: values })
    if (res.response.ok) window.location.assign(next)
    else {
      setError(res.error?.message ?? "Sign-in failed. Try again.")
      setBusy(null)
    }
  }

  return (
    <div className="space-y-10">
      <section aria-labelledby="demo-heading">
        <h2 id="demo-heading" className="text-lg font-semibold tracking-tight">
          Try it as one of three people
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          One click, no account. Each sees the same database through different permissions.
        </p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {personas.isPending &&
            [0, 1, 2].map((i) => (
              <li key={i}>
                <Skeleton className="h-40 w-full" />
              </li>
            ))}
          {personas.data?.map((p) => {
            const Icon = ICONS[p.key]
            return (
              <li key={p.key}>
                <button
                  type="button"
                  onClick={() => demo(p.key)}
                  disabled={busy !== null}
                  className="bg-card hover:border-primary focus-visible:border-primary flex h-full w-full flex-col items-start rounded-lg border p-4 text-left transition-colors disabled:opacity-60"
                >
                  <Icon aria-hidden className="text-primary size-5" />
                  <span className="mt-3 font-medium">{p.display_name}</span>
                  <span className="text-muted-foreground mt-1 text-sm">{p.blurb}</span>
                  <span className="text-primary mt-auto pt-3 text-sm font-medium">
                    {busy === p.key ? "Signing in…" : `Continue as ${p.display_name.split(" ")[0]}`}
                  </span>
                </button>
              </li>
            )
          })}
          {personas.data?.length === 0 && (
            <li className="text-muted-foreground text-sm">Demo sign-in is turned off on this server.</li>
          )}
        </ul>
      </section>

      <section aria-labelledby="pw-heading" className="max-w-sm">
        <h2 id="pw-heading" className="text-sm font-medium">
          Have an account?
        </h2>
        <form onSubmit={form.handleSubmit(submit)} className="mt-3 space-y-3" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={Boolean(form.formState.errors.email)}
              aria-describedby={form.formState.errors.email ? "email-error" : undefined}
              {...form.register("email")}
            />
            {form.formState.errors.email && (
              <p id="email-error" className="text-destructive text-sm">
                {form.formState.errors.email.message}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(form.formState.errors.password)}
              aria-describedby={form.formState.errors.password ? "password-error" : undefined}
              {...form.register("password")}
            />
            {form.formState.errors.password && (
              <p id="password-error" className="text-destructive text-sm">
                {form.formState.errors.password.message}
              </p>
            )}
          </div>
          <Button type="submit" disabled={busy !== null}>
            {busy === "password" ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </section>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  )
}
