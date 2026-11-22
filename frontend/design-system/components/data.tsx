import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "../lib/cn";

/* Table primitives: dense, hairline rows, sticky header option. Compose them like a normal <table>. */

export function Table({ className, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className={cn("w-full border-collapse text-left text-sm", className)} {...rest} />
    </div>
  );
}
export function THead({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("bg-bg-subtle", className)} {...rest} />;
}
export function TBody({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("[&>tr:last-child>td]:border-b-0", className)} {...rest} />;
}
export function TR({ className, interactive, selected, ...rest }: HTMLAttributes<HTMLTableRowElement> & { interactive?: boolean; selected?: boolean }) {
  return (
    <tr
      className={cn(
        interactive && "cursor-pointer transition-colors duration-100 hover:bg-surface-2",
        selected && "bg-accent-soft/60",
        className,
      )}
      {...rest}
    />
  );
}
export function TH({ className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope="col" className={cn("label border-b border-line px-4 py-2.5 font-medium whitespace-nowrap", className)} {...rest} />;
}
export function TD({ className, mono, ...rest }: TdHTMLAttributes<HTMLTableCellElement> & { mono?: boolean }) {
  return <td className={cn("border-b border-line px-4 py-3 text-fg-2 align-middle", mono && "font-mono text-[13px]", className)} {...rest} />;
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="grid place-items-center gap-3 rounded-lg border border-dashed border-line-strong px-6 py-14 text-center">
      {icon ? <div className="grid size-10 place-items-center rounded-lg border border-line bg-surface-2 text-fg-muted">{icon}</div> : null}
      <div className="grid gap-1">
        <p className="font-medium text-fg">{title}</p>
        {description ? <p className="max-w-sm text-sm text-fg-muted text-pretty">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** Horizontal bar used in simulated charts. value is 0 to 1. */
export function Bar({ value, className, tone = "accent" }: { value: number; className?: string; tone?: "accent" | "success" | "warning" | "danger" }) {
  const bg = { accent: "bg-accent", success: "bg-success", warning: "bg-warning", danger: "bg-danger" }[tone];
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-3", className)}>
      <div className={cn("h-full rounded-full", bg)} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

/** Minimal SVG sparkline. No axes, meant for tables and stat cards. */
export function Sparkline({ values, className, stroke = "var(--accent)" }: { values: number[]; className?: string; stroke?: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${100 - ((v - min) / span) * 100}`).join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={cn("h-8 w-24", className)} aria-hidden>
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
