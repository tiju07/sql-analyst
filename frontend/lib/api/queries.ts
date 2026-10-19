"use client"

import { useQuery } from "@tanstack/react-query"

import { api, unwrap } from "./client"

export const keys = {
  me: ["me"] as const,
  conversations: (q?: string) => ["conversations", q ?? ""] as const,
  conversation: (id: string) => ["conversation", id] as const,
  run: (id: string) => ["run", id] as const,
  rows: (id: string) => ["rows", id] as const,
  tables: ["catalog", "tables"] as const,
  table: (id: string) => ["catalog", "table", id] as const,
  metrics: ["semantic", "metrics"] as const,
  verified: (status?: string) => ["verified", status ?? "all"] as const,
  personas: ["personas"] as const,
}

export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => unwrap(await api.GET("/api/auth/me")),
    staleTime: 5 * 60_000,
  })
}

export function useTables() {
  return useQuery({
    queryKey: keys.tables,
    queryFn: async () => unwrap(await api.GET("/api/catalog/tables")),
    staleTime: 5 * 60_000,
  })
}
