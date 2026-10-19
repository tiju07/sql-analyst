import type { Metadata } from "next"

import { VerifiedView } from "@/components/verified/VerifiedView"

export const metadata: Metadata = { title: "Verified queries" }

export default function VerifiedPage() {
  return <VerifiedView />
}
