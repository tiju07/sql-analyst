"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowUpRight, Lock } from "lucide-react";
import { cn } from "../lib/cn";
import { Badge, Button, Card, Field, Input, LinkButton } from "./primitives";
import { Logo } from "./shell";
import { ThemeToggle } from "./theme";

/** Every project links back here. Change it in one place if the portfolio URL moves. */
export const ABOUT_ME_URL = "https://tiju-lukose.pages.dev/";

/* ───────────────────────── Nav ───────────────────────── */

export type SiteLink = { label: string; href: string };

export function SiteNav({
  name,
  links,
  cta,
  aboutMeLabel = "About me",
}: {
  name: string;
  links: SiteLink[];
  cta?: { label: string; href: string };
  aboutMeLabel?: string;
}) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b backdrop-blur-xl transition-colors duration-300",
        scrolled ? "border-line" : "border-transparent",
      )}
      style={{ background: "var(--nav-bg)" }}
    >
      <div className="container-x flex h-14 items-center justify-between gap-6">
        <a href="/" className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent" aria-label={`${name} home`}>
          <Logo name={name} />
        </a>
        <nav aria-label="Site" className="hidden items-center gap-7 text-sm md:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-fg-2 transition-colors hover:text-fg">
              {l.label}
            </a>
          ))}
          <a
            href={ABOUT_ME_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-fg-2 transition-colors hover:text-fg"
          >
            {aboutMeLabel}
            <ArrowUpRight className="size-3.5" aria-hidden />
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LinkButton href={ABOUT_ME_URL} variant="outline" size="sm" className="md:hidden">
            About me
          </LinkButton>
          {cta ? (
            <LinkButton href={cta.href} variant="solid" size="sm" className="hidden sm:inline-flex">
              {cta.label}
            </LinkButton>
          ) : null}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter({ name, tagline, links }: { name: string; tagline: string; links?: SiteLink[] }) {
  return (
    <footer className="mt-32 border-t border-line">
      <div className="container-x flex flex-col gap-8 py-12 md:flex-row md:items-start md:justify-between">
        <div className="grid max-w-sm gap-3">
          <Logo name={name} />
          <p className="text-sm text-fg-muted">{tagline}</p>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
          {links?.map((l) => (
            <a key={l.href} href={l.href} className="text-fg-2 hover:text-fg">
              {l.label}
            </a>
          ))}
          <a href={ABOUT_ME_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-fg-2 hover:text-fg">
            About me <ArrowUpRight className="size-3.5" aria-hidden />
          </a>
        </div>
      </div>
      <div className="border-t border-line">
        <p className="container-x py-5 text-xs text-fg-muted">
          Interactive demo with simulated data. Built by Tiju Lukose as a portfolio project. Nothing here is real customer data.
        </p>
      </div>
    </footer>
  );
}

/* ───────────────────────── Hero / Section ───────────────────────── */

/** Faint grid fading out from the top centre, behind the hero. Pure CSS. */
export function GridBackdrop({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 -z-10", className)}
      style={{
        backgroundImage:
          "linear-gradient(var(--grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--grid-line) 1px, transparent 1px)",
        backgroundSize: "56px 56px",
        maskImage: "radial-gradient(ellipse 70% 60% at 50% 0%, #000 30%, transparent 75%)",
        WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 0%, #000 30%, transparent 75%)",
      }}
    />
  );
}

export function Hero({
  eyebrow,
  title,
  lede,
  actions,
  align = "center",
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lede: ReactNode;
  actions?: ReactNode;
  align?: "center" | "left";
  children?: ReactNode;
}) {
  const center = align === "center";
  return (
    <section className="relative overflow-hidden">
      <GridBackdrop />
      <div className="container-x pt-20 pb-6 sm:pt-28">
        <div className={cn("flex flex-col gap-6", center ? "items-center text-center" : "items-start")}>
          {eyebrow ? <div style={{ animation: "foundry-rise .7s var(--ease-out) both" }}>{eyebrow}</div> : null}
          <h1
            className={cn("max-w-4xl text-balance text-[clamp(2.4rem,6vw,4.5rem)] font-medium leading-[1.02] tracking-[-0.045em]")}
            style={{ animation: "foundry-rise .8s var(--ease-out) .08s both" }}
          >
            {title}
          </h1>
          <p
            className={cn("max-w-2xl text-pretty text-[1.08rem] leading-relaxed text-fg-2", center && "mx-auto")}
            style={{ animation: "foundry-rise .8s var(--ease-out) .16s both" }}
          >
            {lede}
          </p>
          {actions ? (
            <div className="mt-2 flex flex-wrap gap-3" style={{ animation: "foundry-rise .8s var(--ease-out) .24s both" }}>
              {actions}
            </div>
          ) : null}
        </div>
        {children ? (
          <div className="mt-14 sm:mt-16" style={{ animation: "foundry-rise 1s var(--ease-out) .32s both" }}>
            {children}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function Section({
  id,
  label,
  title,
  lede,
  children,
  className,
}: {
  id?: string;
  label?: string;
  title: ReactNode;
  lede?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("container-x pt-28", className)}>
      <div className="mb-10 grid max-w-2xl gap-3">
        {label ? <span className="label">{label}</span> : null}
        <h2 className="text-balance text-[clamp(1.9rem,3.6vw,2.7rem)] leading-[1.08] tracking-[-0.035em]">{title}</h2>
        {lede ? <p className="text-pretty text-[1.02rem] text-fg-2">{lede}</p> : null}
      </div>
      {children}
    </section>
  );
}

/* ───────────────────────── Feature grid ───────────────────────── */

export function FeatureGrid({
  items,
  columns = 3,
}: {
  items: { icon?: ReactNode; title: string; body: string; tag?: string }[];
  columns?: 2 | 3 | 4;
}) {
  const cols = { 2: "md:grid-cols-2", 3: "md:grid-cols-2 lg:grid-cols-3", 4: "md:grid-cols-2 lg:grid-cols-4" }[columns];
  return (
    <div className={cn("hairline grid-cols-1", cols)}>
      {items.map((it) => (
        <div key={it.title} className="grid content-start gap-3 p-7 transition-colors duration-200 hover:bg-bg-subtle">
          <div className="flex items-center justify-between">
            {it.icon ? <span className="grid size-9 place-items-center rounded-md border border-line bg-surface-2 text-fg [&>svg]:size-[18px]">{it.icon}</span> : <span />}
            {it.tag ? <Badge mono>{it.tag}</Badge> : null}
          </div>
          <h3 className="text-[1.02rem] tracking-[-0.015em]">{it.title}</h3>
          <p className="text-sm leading-relaxed text-fg-muted">{it.body}</p>
        </div>
      ))}
    </div>
  );
}

export function StatStrip({ items }: { items: { label: string; value: string; note?: string }[] }) {
  return (
    <div className={cn("hairline grid-cols-2", items.length === 3 ? "md:grid-cols-3" : "md:grid-cols-4")}>
      {items.map((s) => (
        <div key={s.label} className="grid gap-1.5 p-6">
          <span className="label">{s.label}</span>
          <span className="text-3xl font-medium tracking-tight text-fg tabular">{s.value}</span>
          {s.note ? <span className="text-xs text-fg-muted">{s.note}</span> : null}
        </div>
      ))}
    </div>
  );
}

/** Scrolling strip of technology names. Pauses on hover and under reduced motion. */
export function StackMarquee({ items, label = "Built with" }: { items: string[]; label?: string }) {
  const doubled = [...items, ...items];
  return (
    <div className="container-x mt-16">
      <div className="grid items-center gap-4 border-y border-line py-4 md:grid-cols-[140px_1fr]">
        <span className="label">{label}</span>
        <div className="group overflow-hidden" style={{ maskImage: "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)", WebkitMaskImage: "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)" }}>
          <div className="flex w-max gap-10 group-hover:[animation-play-state:paused]" style={{ animation: "foundry-marquee 40s linear infinite" }}>
            {doubled.map((t, i) => (
              <span key={`${t}-${i}`} className="whitespace-nowrap text-[0.95rem] font-medium text-fg opacity-60 transition-opacity hover:opacity-100">
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="divide-y divide-line overflow-hidden rounded-lg border border-line">
      {items.map((it) => (
        <details key={it.q} className="group bg-surface px-6 py-4 open:bg-bg-subtle">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-fg [&::-webkit-details-marker]:hidden">
            {it.q}
            <span aria-hidden className="text-fg-muted transition-transform duration-200 group-open:rotate-45">+</span>
          </summary>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-fg-muted">{it.a}</p>
        </details>
      ))}
    </div>
  );
}

export function CtaBand({ title, body, actions }: { title: string; body: string; actions: ReactNode }) {
  return (
    <section className="container-x pt-28">
      <div className="relative overflow-hidden rounded-2xl border border-line bg-bg-subtle px-8 py-14 text-center sm:px-16">
        <GridBackdrop />
        <h2 className="mx-auto max-w-2xl text-balance text-[clamp(1.8rem,3.4vw,2.5rem)] leading-tight">{title}</h2>
        <p className="mx-auto mt-3 max-w-xl text-fg-2">{body}</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">{actions}</div>
      </div>
    </section>
  );
}

/* ───────────────────────── Closed access ───────────────────────── */

/** Sign-in card for the static demos: the form is visible but disabled, with a clear explanation. */
export function ClosedAuthCard({ product, mode = "signin" }: { product: string; mode?: "signin" | "signup" }) {
  return (
    <div className="mx-auto grid w-full max-w-sm gap-6">
      <div className="grid gap-2 text-center">
        <Logo name={product} className="mx-auto" />
        <h1 className="text-2xl tracking-tight">{mode === "signin" ? "Sign in" : "Create an account"}</h1>
      </div>
      <Card className="grid gap-4 p-6">
        <div className="flex items-start gap-3 rounded-md border border-line bg-surface-2 p-3 text-sm text-fg-2">
          <Lock className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden />
          <p>
            Sign-ups and sign-ins are closed. This is a read-only demo with simulated data, so there is nothing to log in to. Watch the walkthrough on the home page instead.
          </p>
        </div>
        <Field label="Email">{(id) => <Input id={id} type="email" placeholder="you@company.com" disabled />}</Field>
        <Field label="Password">{(id) => <Input id={id} type="password" placeholder="••••••••" disabled />}</Field>
        <Button disabled className="w-full">
          {mode === "signin" ? "Sign in" : "Create account"}
        </Button>
      </Card>
      <p className="text-center text-sm text-fg-muted">
        <a className="text-fg underline underline-offset-4" href="/">
          Back to the demo
        </a>
        {" · "}
        <a className="text-fg underline underline-offset-4" href={ABOUT_ME_URL} target="_blank" rel="noopener noreferrer">
          About me
        </a>
      </p>
    </div>
  );
}
