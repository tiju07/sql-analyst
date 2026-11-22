/* Time-driven animation helpers for walkthrough scenes.
 *
 * A scene render function receives `t` (ms since the scene started). Everything on screen is a pure
 * function of `t`, so scenes can be paused, restarted, skipped and rendered at their final state for
 * reduced-motion users. No timers or state live inside a scene.
 */

export const clamp = (v: number, min = 0, max = 1): number => Math.min(max, Math.max(min, v));
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

export type Ease = (k: number) => number;
export const linear: Ease = (k) => k;
export const easeOutCubic: Ease = (k) => 1 - Math.pow(1 - k, 3);
export const easeInOutCubic: Ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
export const easeOutExpo: Ease = (k) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k));

/** Progress 0 to 1 of the time window [start, end] at time t. */
export function seg(t: number, start: number, end: number, ease: Ease = easeOutCubic): number {
  if (end <= start) return t >= end ? 1 : 0;
  return ease(clamp((t - start) / (end - start)));
}

/** Text typed at `cps` characters per second starting at `start`. */
export function typed(text: string, t: number, start: number, cps = 32): string {
  const n = Math.floor(Math.max(0, t - start) / 1000 * cps);
  return text.slice(0, Math.min(text.length, n));
}

/** End time of typing `text` that started at `start`. */
export function typedEnd(text: string, start: number, cps = 32): number {
  return start + (text.length / cps) * 1000;
}

/** First N words of `text`, revealed at `wps` words per second. Good for streamed model output. */
export function streamed(text: string, t: number, start: number, wps = 9): string {
  const words = text.split(/(\s+)/);
  const n = Math.floor(Math.max(0, t - start) / 1000 * wps) * 2;
  return words.slice(0, n).join("");
}

/** Animated number between from and to over [start, end]. */
export function count(t: number, start: number, end: number, from: number, to: number, ease: Ease = easeOutCubic): number {
  return lerp(from, to, seg(t, start, end, ease));
}

export type Waypoint = { t: number; x: number; y: number; click?: boolean };

export type PointerState = { x: number; y: number; clickAge: number | null };

/** Interpolates a pointer path (design pixels) and reports how long ago the last click happened. */
export function pointAt(path: Waypoint[], t: number): PointerState {
  const first = path[0];
  if (!first) return { x: 0, y: 0, clickAge: null };
  let clickAge: number | null = null;
  for (const w of path) if (w.click && t >= w.t) clickAge = t - w.t;
  if (t <= first.t) return { x: first.x, y: first.y, clickAge };
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (!a || !b) continue;
    if (t <= b.t) {
      const k = easeInOutCubic(clamp((t - a.t) / Math.max(1, b.t - a.t)));
      return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), clickAge };
    }
  }
  const last = path[path.length - 1] ?? first;
  return { x: last.x, y: last.y, clickAge };
}
