import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Vendored Foundry design system: framework-neutral code, kept identical to its source.
  // Requests to fix these upstream are in docs/DESIGN_SYSTEM_REQUESTS.md.
  {
    files: ["design-system/**"],
    rules: { "@next/next/no-html-link-for-pages": "off", "react-hooks/set-state-in-effect": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Playwright output (reports bundle minified JS)
    "tests/e2e/artifacts/**",
    ".lighthouseci/**",
    "tests/e2e-static/artifacts/**",
  ]),
])

export default eslintConfig
