import { notFound } from "next/navigation"

import { AuthFrame } from "@/components/layout/AuthFrame"
import { ClosedAuthCard } from "@/design-system"
import { pageMetadata } from "@/lib/metadata"
import { IS_STATIC, PRODUCT_NAME } from "@/lib/site"

export const metadata = pageMetadata({ title: "Create an account", path: "/signup/", index: false })

/** The product has no self sign-up (accounts are seeded); the static demo shows it closed. */
export default function SignupPage() {
  if (!IS_STATIC) notFound()
  return (
    <AuthFrame>
      <ClosedAuthCard product={PRODUCT_NAME} mode="signup" />
    </AuthFrame>
  )
}
