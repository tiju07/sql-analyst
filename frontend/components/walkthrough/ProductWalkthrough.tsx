"use client"

import { Walkthrough } from "@/design-system"

import { SCENES } from "./scenes"

export function ProductWalkthrough() {
  return <Walkthrough scenes={SCENES} url="sql-analyst.pages.dev/app" />
}
