import "./globals.css"

import { RootDocument } from "@/components/layout/RootDocument"
import { NotFoundContent } from "@/components/marketing/NotFoundContent"
import { baseMetadata, pageMetadata } from "@/lib/metadata"

export const metadata = { ...baseMetadata, ...pageMetadata({ title: "Page not found", path: "/404/", index: false }) }

export default function GlobalNotFound() {
  return (
    <RootDocument>
      <NotFoundContent />
    </RootDocument>
  )
}
