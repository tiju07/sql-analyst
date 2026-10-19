/**
 * Minimal Server-Sent Events parser for fetch() streams (POST bodies rule out EventSource).
 * Follows the WHATWG event-stream format: `event:`/`data:` fields, multi-line data, `:` comments
 * (our heartbeats), CR/LF/CRLF line endings, and events split across network chunks.
 */

export type SseMessage = { event: string; data: string }

export function createSseParser(onMessage: (message: SseMessage) => void) {
  let buffer = ""
  let event = ""
  let data: string[] = []
  let sawCR = false

  function dispatch() {
    if (data.length > 0) onMessage({ event: event || "message", data: data.join("\n") })
    event = ""
    data = []
  }

  function line(text: string) {
    if (text === "") return dispatch()
    if (text.startsWith(":")) return // comment / heartbeat
    const colon = text.indexOf(":")
    const field = colon === -1 ? text : text.slice(0, colon)
    let value = colon === -1 ? "" : text.slice(colon + 1)
    if (value.startsWith(" ")) value = value.slice(1)
    if (field === "event") event = value
    else if (field === "data") data.push(value)
  }

  return {
    feed(chunk: string) {
      for (const ch of chunk) {
        if (sawCR) {
          sawCR = false
          if (ch === "\n") continue // CRLF already handled at the CR
        }
        if (ch === "\r" || ch === "\n") {
          sawCR = ch === "\r"
          line(buffer)
          buffer = ""
        } else {
          buffer += ch
        }
      }
    },
  }
}

/** Read a fetch() body as SSE messages until the stream ends. */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseMessage> {
  const queue: SseMessage[] = []
  const parser = createSseParser((m) => queue.push(m))
  const reader = body.getReader()
  const decoder = new TextDecoder()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      parser.feed(decoder.decode(value, { stream: true }))
      while (queue.length) yield queue.shift() as SseMessage
    }
  } finally {
    reader.releaseLock()
  }
}
