import { expect, it } from "vitest"

import { safeNext } from "@/lib/safe-next"

it.each([
  ["/app?c=1", "/app?c=1"],
  ["/app/catalog", "/app/catalog"],
  [null, "/app"],
  ["", "/app"],
  ["//evil.com", "/app"],
  ["/\\evil.com", "/app"],
  ["https://evil.com", "/app"],
  ["javascript:alert(1)", "/app"],
])("safeNext(%s) = %s", (input, expected) => {
  expect(safeNext(input)).toBe(expected)
})
