import { ClosedAuthCard } from "@/design-system"
import { PersonaSwitch } from "@/components/demo/PersonaSwitch"
import { SUGGESTIONS } from "@/fixtures/scenarios"
import { demo } from "@/lib/demo/instance"
import { PRODUCT_NAME } from "@/lib/site"

import type { Mode } from "./types"

/** The static demo: fixtures instead of the backend, no sign-in, a persona switch instead. */

function SignIn() {
  return <ClosedAuthCard product={PRODUCT_NAME} />
}

export const mode: Mode = {
  isDemo: true,
  data: demo,
  SignIn,
  AccountMenu: PersonaSwitch,
  examples: { admin: SUGGESTIONS.all, analyst: SUGGESTIONS.all, regional: SUGGESTIONS.regional },
}
