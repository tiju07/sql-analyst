import type { Metadata } from "next"
import { Suspense } from "react"

import { CatalogView } from "@/components/catalog/CatalogView"

export const metadata: Metadata = { title: "Data catalog" }

export default function CatalogPage() {
  return (
    <Suspense>
      <CatalogView />
    </Suspense>
  )
}
