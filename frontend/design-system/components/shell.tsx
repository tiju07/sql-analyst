import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { Dot } from "./primitives";

/* App shell used by the product UI and by the simulated app inside demos.
 * Linear-style: a quiet sidebar, a slim top bar, dense content. */

export type NavItem = { id: string; label: string; icon?: ReactNode; badge?: string; href?: string };

export function Logo({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 font-semibold tracking-tight text-fg", className)}>
      <span aria-hidden className="size-3.5 bg-fg" style={{ clipPath: "polygon(0 0, 100% 0, 100% 100%, 50% 100%, 50% 50%, 0 50%)" }} />
      {name}
    </span>
  );
}

export function AppShell({
  brand,
  nav,
  activeId,
  onNavigate,
  topbar,
  footer,
  compact,
  children,
  className,
}: {
  brand: string;
  nav: NavItem[];
  activeId: string;
  onNavigate?: (id: string) => void;
  topbar?: ReactNode;
  footer?: ReactNode;
  /** Phone layout for demos: no sidebar, brand and section name in the top bar. */
  compact?: boolean;
  children: ReactNode;
  className?: string;
}) {
  if (compact) {
    const active = nav.find((n) => n.id === activeId);
    return (
      <div className={cn("flex h-full min-h-0 flex-col bg-bg text-fg-2", className)}>
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
          <Logo name={brand} />
          <span className="text-[13px] text-fg-muted">{active?.label}</span>
        </header>
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    );
  }
  return (
    <div className={cn("grid h-full min-h-0 grid-cols-[216px_1fr] bg-bg text-fg-2", className)}>
      <aside className="flex min-h-0 flex-col gap-4 border-r border-line bg-bg-subtle px-3 py-4">
        <div className="px-2">
          <Logo name={brand} />
        </div>
        <nav aria-label="Primary" className="grid gap-0.5">
          {nav.map((item) => {
            const active = item.id === activeId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate?.(item.id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] font-medium transition-colors duration-100",
                  active ? "bg-surface-3 text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                )}
              >
                <span className="grid size-4 place-items-center text-current opacity-80 [&>svg]:size-4">{item.icon}</span>
                <span className="truncate">{item.label}</span>
                {item.badge ? <span className="ml-auto rounded-sm bg-surface-3 px-1.5 text-[11px] tabular text-fg-muted">{item.badge}</span> : null}
              </button>
            );
          })}
        </nav>
        <div className="mt-auto px-1">{footer}</div>
      </aside>
      <div className="flex min-h-0 min-w-0 flex-col">
        {topbar ? <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-5">{topbar}</header> : null}
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-medium tracking-tight text-fg">{title}</h1>
        {description ? <p className="mt-1 text-sm text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Breadcrumb({ items }: { items: string[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[13px] text-fg-muted">
      {items.map((it, i) => (
        <span key={it} className="flex items-center gap-2">
          {i > 0 ? <span aria-hidden className="text-fg-faint">/</span> : null}
          <span className={i === items.length - 1 ? "font-medium text-fg" : undefined}>{it}</span>
        </span>
      ))}
    </nav>
  );
}

export function StatusPill({ status, tone }: { status: string; tone: "success" | "warning" | "danger" | "info" | "neutral" | "accent" }) {
  const map = {
    success: "text-success bg-success-soft",
    warning: "text-warning bg-warning-soft",
    danger: "text-danger bg-danger-soft",
    info: "text-info bg-info-soft",
    neutral: "text-fg-2 bg-surface-2",
    accent: "text-accent-ink bg-accent-soft",
  } as const;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", map[tone])}>
      <Dot tone={tone} />
      {status}
    </span>
  );
}
