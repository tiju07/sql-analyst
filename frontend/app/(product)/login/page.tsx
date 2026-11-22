import { mode } from "app-mode"

import { AuthFrame } from "@/components/layout/AuthFrame"
import { pageMetadata } from "@/lib/metadata"

export const metadata = pageMetadata({ title: "Sign in", path: "/login/", index: false })

export default function LoginPage() {
  return (
    <AuthFrame>
      <mode.SignIn />
    </AuthFrame>
  )
}
