"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react";
import { cn } from "../lib/cn";
import { IconButton } from "../components/primitives";
import { WindowFrame } from "./parts";

export type SceneContext = {
  /** Milliseconds since this scene started. At the end of the scene this equals `duration`. */
  t: number;
  duration: number;
  /** 0 to 1 */
  progress: number;
  /** True on narrow screens. The window is then compactWidth x compactHeight, so lay the scene out for a phone. */
  compact: boolean;
};

export type WalkthroughScene = {
  id: string;
  /** Short step name shown in the step list. */
  title: string;
  /** One or two sentences explaining what the viewer is looking at. Plain English. */
  caption: string;
  /** Milliseconds. 4000 to 9000 works well. */
  duration: number;
  render: (ctx: SceneContext) => ReactNode;
};

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/**
 * Scripted product walkthrough: a scaled browser window plays scenes in order, with captions,
 * a step list, play/pause, restart and keyboard control.
 *
 * - Autoplays when scrolled into view, pauses when it leaves view or the tab is hidden.
 * - Reduced motion: no autoplay, scenes show their final state, step with Previous / Next.
 * - The window is a fixed design size (default 1120 x 680) scaled to fit, so scenes never reflow.
 */
export function Walkthrough({
  scenes,
  url,
  width = 1120,
  height = 680,
  compactWidth = 420,
  compactHeight = 700,
  autoplay = true,
  loop = true,
  className,
}: {
  scenes: WalkthroughScene[];
  url?: string;
  width?: number;
  height?: number;
  compactWidth?: number;
  compactHeight?: number;
  autoplay?: boolean;
  loop?: boolean;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [scale, setScale] = useState(1);
  const [compact, setCompact] = useState(false);

  const hostRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef(0);
  const tRef = useRef(0);
  const playingRef = useRef(false);
  const userPausedRef = useRef(false);
  const inViewRef = useRef(false);

  const scene = scenes[index];
  const last = scenes.length - 1;

  const setPlay = useCallback((v: boolean) => {
    playingRef.current = v;
    setPlaying(v);
  }, []);

  const goto = useCallback((i: number) => {
    const clamped = Math.max(0, Math.min(scenes.length - 1, i));
    indexRef.current = clamped;
    tRef.current = 0;
    setIndex(clamped);
    setT(0);
  }, [scenes.length]);

  // Fit the fixed-size window to the available width.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const fit = () => {
      const isCompact = el.clientWidth < 560;
      setCompact(isCompact);
      setScale(Math.min(1, el.clientWidth / (isCompact ? compactWidth : width)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width, compactWidth]);

  // Clock.
  useEffect(() => {
    if (!playing || reduced) return;
    let raf = 0;
    let prev = performance.now();
    let acc = 0;
    const tick = (now: number) => {
      const dt = Math.min(100, now - prev);
      prev = now;
      acc += dt;
      if (acc >= 33) {
        // about 30 updates a second is smooth enough for a UI walkthrough and cheap to render
        const nextT = tRef.current + acc;
        acc = 0;
        const dur = scenes[indexRef.current]?.duration ?? 0;
        if (nextT >= dur) {
          if (indexRef.current < scenes.length - 1) {
            indexRef.current += 1;
            tRef.current = 0;
            setIndex(indexRef.current);
            setT(0);
          } else if (loop) {
            indexRef.current = 0;
            tRef.current = 0;
            setIndex(0);
            setT(0);
          } else {
            tRef.current = dur;
            setT(dur);
            setPlay(false);
            return;
          }
        } else {
          tRef.current = nextT;
          setT(nextT);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, reduced, loop, scenes, setPlay]);

  // Autoplay when visible, pause when not.
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        const visible = !!entry && entry.isIntersecting;
        inViewRef.current = visible;
        if (visible && autoplay && !userPausedRef.current && !reduced) setPlay(true);
        if (!visible) setPlay(false);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    const onVis = () => {
      if (document.hidden) setPlay(false);
      else if (inViewRef.current && autoplay && !userPausedRef.current && !reduced) setPlay(true);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [autoplay, reduced, setPlay]);

  const toggle = () => {
    if (playingRef.current) {
      userPausedRef.current = true;
      setPlay(false);
    } else {
      userPausedRef.current = false;
      if (tRef.current >= (scene?.duration ?? 0)) goto(indexRef.current >= last ? 0 : indexRef.current + 1);
      setPlay(true);
    }
  };

  const restart = () => {
    userPausedRef.current = false;
    goto(0);
    if (!reduced) setPlay(true);
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight") { e.preventDefault(); goto(index + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); goto(index - 1); }
    else if (e.key === " " && !reduced) { e.preventDefault(); toggle(); }
  };

  const ctx = useMemo<SceneContext>(() => {
    const duration = scene?.duration ?? 1;
    const tt = reduced ? duration : t;
    return { t: tt, duration, progress: Math.min(1, tt / duration), compact };
  }, [scene, t, reduced, compact]);

  if (!scene) return null;

  return (
    <div
      ref={hostRef}
      role="region"
      aria-roledescription="product walkthrough"
      aria-label="Product walkthrough"
      tabIndex={0}
      onKeyDown={onKey}
      className={cn("grid grid-cols-[minmax(0,1fr)] gap-4 rounded-2xl outline-offset-4 focus-visible:outline-2 focus-visible:outline-accent", className)}
    >
      <div ref={boxRef} className="w-full min-w-0">
        <div className="overflow-hidden" style={{ height: (compact ? compactHeight : height) * scale }}>
          <div style={{ width: compact ? compactWidth : width, height: compact ? compactHeight : height, transform: `scale(${scale})`, transformOrigin: "top left" }}>
            <WindowFrame url={url}>
              <div className="relative h-full overflow-hidden" aria-hidden inert>
                {scene.render(ctx)}
              </div>
            </WindowFrame>
          </div>
        </div>
      </div>

      {/* Segmented progress: click a segment to jump to that step */}
      <div className="flex gap-1.5" aria-hidden>
        {scenes.map((s, i) => (
          <button
            key={s.id}
            type="button"
            tabIndex={-1}
            onClick={() => goto(i)}
            className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3"
          >
            <span
              className="block h-full rounded-full bg-accent"
              style={{ width: i < index ? "100%" : i === index ? `${ctx.progress * 100}%` : "0%" }}
            />
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-start">
        <div aria-live="polite" className="grid gap-1.5">
          <span className="label">
            Step {index + 1} of {scenes.length}
          </span>
          <p className="text-[1.05rem] font-medium tracking-tight text-fg">{scene.title}</p>
          <p className="max-w-2xl text-sm leading-relaxed text-fg-2">{scene.caption}</p>
        </div>
        <div className="flex items-center gap-2">
          <IconButton label="Previous step" onClick={() => goto(index - 1)} disabled={index === 0}>
            <ChevronLeft className="size-4" />
          </IconButton>
          {!reduced ? (
            <IconButton label={playing ? "Pause walkthrough" : "Play walkthrough"} onClick={toggle}>
              {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            </IconButton>
          ) : null}
          <IconButton label="Next step" onClick={() => goto(index + 1)} disabled={index === last}>
            <ChevronRight className="size-4" />
          </IconButton>
          <IconButton label="Restart walkthrough" onClick={restart}>
            <RotateCcw className="size-4" />
          </IconButton>
        </div>
      </div>

      {/* Step list: readable by everyone, and the real content for screen readers */}
      <ol className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {scenes.map((s, i) => (
          <li key={s.id} className="shrink-0">
            <button
              type="button"
              onClick={() => goto(i)}
              aria-current={i === index ? "step" : undefined}
              className={cn(
                "rounded-md border px-3 py-1.5 text-[13px] transition-colors duration-150",
                i === index ? "border-accent bg-accent-soft text-accent-ink" : "border-line text-fg-muted hover:border-line-strong hover:text-fg",
              )}
            >
              <span className="mr-1.5 font-mono text-[11px] opacity-70">{i + 1}</span>
              {s.title}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
