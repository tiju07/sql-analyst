import { ImageResponse } from "next/og"

import { PRODUCT_NAME, TAGLINE } from "@/lib/site"

export const alt = `${PRODUCT_NAME}: ${TAGLINE}`
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default function OpengraphImage() {
  const bars = [100, 35, 30, 14, 13]
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        background: "#fafafa",
        padding: 72,
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", width: 620 }}>
        <div style={{ fontSize: 32, color: "#0e7c86", fontWeight: 600 }}>{PRODUCT_NAME}</div>
        <div style={{ fontSize: 64, color: "#16181d", fontWeight: 600, marginTop: 24, lineHeight: 1.1 }}>
          Plain-English questions. SQL you can check.
        </div>
        <div style={{ fontSize: 28, color: "#5b6170", marginTop: 28, lineHeight: 1.35 }}>{TAGLINE}</div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          marginLeft: 64,
          gap: 18,
          width: 380,
        }}
      >
        {bars.map((w, i) => (
          <div
            key={i}
            style={{ display: "flex", height: 34, width: `${w}%`, background: "#00919f", borderRadius: "0 6px 6px 0" }}
          />
        ))}
      </div>
    </div>,
    size,
  )
}
