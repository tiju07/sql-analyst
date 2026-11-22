import type { ReactNode } from "react"

import { themeInitScript } from "@/lib/theme-script"

/** <html> shared by both root layouts and the 404: Foundry accent, theme before first paint. */
export function RootDocument({ children, nonce }: { children: ReactNode; nonce?: string }) {
  return (
    <html lang="en" data-accent="blue" suppressHydrationWarning>
      <body className="min-h-dvh">
        {/* First in <body>: runs before any content paints, so the saved theme never flashes. */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {children}
      </body>
    </html>
  )
}
