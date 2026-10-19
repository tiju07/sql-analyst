import { describe, expect, it } from "vitest"

import { createSseParser, readSse, type SseMessage } from "@/lib/sse"

function parse(...chunks: string[]): SseMessage[] {
  const out: SseMessage[] = []
  const p = createSseParser((m) => out.push(m))
  chunks.forEach((c) => p.feed(c))
  return out
}

describe("createSseParser", () => {
  it("parses named events", () => {
    expect(parse('event: stage\ndata: {"a":1}\n\n')).toEqual([{ event: "stage", data: '{"a":1}' }])
  })

  it("joins multi-line data and defaults the event name", () => {
    expect(parse("data: a\ndata: b\n\n")).toEqual([{ event: "message", data: "a\nb" }])
  })

  it("ignores comments (heartbeats) and fields without data", () => {
    expect(parse(": ping\n\nevent: x\n\n")).toEqual([])
  })

  it("handles events split across arbitrary chunks", () => {
    expect(parse("eve", "nt: done\nda", 'ta: {"ok":true}', "\n", "\n")).toEqual([
      { event: "done", data: '{"ok":true}' },
    ])
  })

  it("accepts CRLF and lone CR line endings, including CRLF split across chunks", () => {
    expect(parse("event: a\r\ndata: 1\r", "\n\r\nevent: b\rdata: 2\r\r")).toEqual([
      { event: "a", data: "1" },
      { event: "b", data: "2" },
    ])
  })

  it("keeps colons inside values and strips one leading space only", () => {
    expect(parse("data:  x:y\n\n")).toEqual([{ event: "message", data: " x:y" }])
  })

  it("resets the event name between messages", () => {
    expect(parse("event: a\ndata: 1\n\ndata: 2\n\n").map((m) => m.event)).toEqual(["a", "message"])
  })
})

describe("readSse", () => {
  it("reads a byte stream", async () => {
    const enc = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode("event: run\ndata: {}\n\n: ping\n\nevent: do"))
        c.enqueue(enc.encode("ne\ndata: {}\n\n"))
        c.close()
      },
    })
    const names: string[] = []
    for await (const m of readSse(body)) names.push(m.event)
    expect(names).toEqual(["run", "done"])
  })
})
