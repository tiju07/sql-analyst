import type { CSSProperties, ReactNode } from "react";
import { cn } from "../lib/cn";
import { pointAt, seg, streamed, typed, typedEnd, type Waypoint } from "./anim";

/** Browser-style window the simulated app lives in. Fills its parent, so size it from outside. */
export function WindowFrame({ url, children, className }: { url?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex h-full w-full flex-col overflow-hidden rounded-xl border border-line-strong bg-bg shadow-window", className)}>
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-line bg-bg-subtle px-4">
        <div className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="size-2.5 rounded-full bg-line-strong" />
        </div>
        {url ? (
          <div className="mx-auto flex h-6 w-full max-w-sm items-center justify-center rounded-md border border-line bg-surface px-3 font-mono text-[11px] text-fg-muted">
            {url}
          </div>
        ) : null}
        <span className="w-12" aria-hidden />
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

/** Fade and slide in at `at` ms over `dur` ms. Optionally fade out at `until`. */
export function Appear({
  t,
  at = 0,
  dur = 420,
  y = 10,
  until,
  className,
  style,
  children,
}: {
  t: number;
  at?: number;
  dur?: number;
  y?: number;
  until?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const inK = seg(t, at, at + dur);
  const outK = until === undefined ? 0 : seg(t, until, until + 260);
  const k = inK * (1 - outK);
  return (
    <div className={className} style={{ opacity: k, transform: `translateY(${(1 - inK) * y}px)`, pointerEvents: k < 0.05 ? "none" : undefined, ...style }}>
      {children}
    </div>
  );
}

/** Typed text with a blinking caret while it is still typing. */
export function Typing({ text, t, start, cps = 32, className }: { text: string; t: number; start: number; cps?: number; className?: string }) {
  const done = t >= typedEnd(text, start, cps);
  const visible = typed(text, t, start, cps);
  return (
    <span className={className}>
      {visible}
      {!done && t >= start ? <span aria-hidden className="ml-px inline-block h-[1.05em] w-[2px] translate-y-[2px] bg-accent" /> : null}
    </span>
  );
}

/** Words revealed over time, like a streamed model answer. */
export function Stream({ text, t, start, wps = 9, className }: { text: string; t: number; start: number; wps?: number; className?: string }) {
  return <span className={className}>{streamed(text, t, start, wps)}</span>;
}

/** Animated pointer. Positions are design pixels inside the window. */
export function Cursor({ path, t }: { path: Waypoint[]; t: number }) {
  const p = pointAt(path, t);
  const first = path[0];
  if (!first || t < first.t - 400) return null;
  const ripple = p.clickAge !== null && p.clickAge < 520 ? p.clickAge / 520 : null;
  return (
    <div className="pointer-events-none absolute left-0 top-0 z-50" style={{ transform: `translate(${p.x}px, ${p.y}px)` }} aria-hidden>
      {ripple !== null ? (
        <span
          className="absolute -left-4 -top-4 size-8 rounded-full border-2 border-accent"
          style={{ opacity: 1 - ripple, transform: `scale(${0.4 + ripple * 1.1})` }}
        />
      ) : null}
      <svg width="22" height="22" viewBox="0 0 22 22" className="drop-shadow-md" style={{ transform: ripple !== null && ripple < 0.25 ? "scale(0.9)" : undefined }}>
        <path d="M3 2l15 7.5-6.2 1.9-2.3 6.1L3 2z" fill="var(--fg)" stroke="var(--bg)" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/** Pulsing ring that draws the eye to a region. Wrap the target or place it absolutely. */
export function Ring({ t, at, until, className }: { t: number; at: number; until?: number; className?: string }) {
  const k = seg(t, at, at + 300) * (until === undefined ? 1 : 1 - seg(t, until, until + 250));
  if (k <= 0.01) return null;
  return (
    <span
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 rounded-md border-2 border-accent", className)}
      style={{ opacity: k, boxShadow: "0 0 0 4px var(--accent-ring)" }}
    />
  );
}
