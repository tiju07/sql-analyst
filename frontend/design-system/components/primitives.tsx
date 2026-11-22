"use client";

import {
  forwardRef,
  useId,
  useState,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "../lib/cn";

/* ───────────────────────── Button ───────────────────────── */

export type ButtonVariant = "primary" | "solid" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const buttonBase =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium select-none " +
  "transition-[background-color,border-color,color,box-shadow] duration-150 ease-out " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
  "disabled:opacity-50 disabled:pointer-events-none aria-disabled:opacity-50 aria-disabled:pointer-events-none";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg border border-transparent hover:bg-accent-hover shadow-xs",
  solid: "bg-fg text-bg border border-transparent hover:opacity-90",
  secondary: "bg-surface-2 text-fg border border-line hover:border-line-strong hover:bg-surface-3",
  outline: "bg-transparent text-fg border border-line-strong hover:bg-surface-2",
  ghost: "bg-transparent text-fg-2 border border-transparent hover:bg-surface-2 hover:text-fg",
  danger: "bg-danger text-white border border-transparent hover:opacity-90",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-9 px-4 text-sm",
  lg: "h-11 px-5 text-[15px]",
};

type ButtonOwnProps = { variant?: ButtonVariant; size?: ButtonSize; leading?: ReactNode; trailing?: ReactNode };

export type ButtonProps = ButtonOwnProps & ButtonHTMLAttributes<HTMLButtonElement>;
export type LinkButtonProps = ButtonOwnProps & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string): string {
  return cn(buttonBase, buttonVariants[variant], buttonSizes[size], className);
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", leading, trailing, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClass(variant, size, className)} {...rest}>
      {leading}
      {children}
      {trailing}
    </button>
  );
});

/** Same look as Button but renders an anchor. External links open in a new tab safely. */
export function LinkButton({ variant = "primary", size = "md", leading, trailing, className, children, href, ...rest }: LinkButtonProps) {
  const external = /^https?:\/\//.test(href);
  return (
    <a
      href={href}
      className={buttonClass(variant, size, className)}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      {...rest}
    >
      {leading}
      {children}
      {trailing}
    </a>
  );
}

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string }>(
  function IconButton({ label, className, children, type = "button", ...rest }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        title={label}
        className={cn(
          "inline-grid size-8 place-items-center rounded-md border border-line text-fg-2 transition-colors duration-150",
          "hover:border-line-strong hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    );
  },
);

/* ───────────────────────── Badge / Kbd / Dot ───────────────────────── */

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

const toneClass: Record<Tone, string> = {
  neutral: "bg-surface-2 text-fg-2 border-line",
  accent: "bg-accent-soft text-accent-ink border-transparent",
  success: "bg-success-soft text-success border-transparent",
  warning: "bg-warning-soft text-warning border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
  info: "bg-info-soft text-info border-transparent",
};
const dotClass: Record<Tone, string> = {
  neutral: "bg-fg-faint",
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};

export function Dot({ tone = "neutral", pulse = false, className }: { tone?: Tone; pulse?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-1.5 shrink-0 rounded-full", dotClass[tone], className)}
      style={pulse ? { animation: "foundry-pulse 2s infinite" } : undefined}
    />
  );
}

export function Badge({
  tone = "neutral",
  dot,
  mono,
  className,
  children,
}: {
  tone?: Tone;
  dot?: boolean | "pulse";
  mono?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-medium leading-5 whitespace-nowrap",
        mono && "font-mono text-[11px]",
        toneClass[tone],
        className,
      )}
    >
      {dot ? <Dot tone={tone} pulse={dot === "pulse"} /> : null}
      {children}
    </span>
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-grid min-w-5 place-items-center rounded-sm border border-line-strong bg-surface-2 px-1.5 text-[11px] leading-5 text-fg-2",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/* ───────────────────────── Card ───────────────────────── */

export function Card({
  interactive,
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-line bg-surface shadow-[var(--inner-highlight)]",
        interactive && "transition-colors duration-150 hover:border-line-strong hover:bg-surface-2",
        className,
      )}
      {...rest}
    />
  );
}

export function CardHeader({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 border-b border-line px-5 py-4", className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-medium tracking-tight text-fg">{title}</h3>
        {description ? <p className="mt-0.5 text-sm text-fg-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/* ───────────────────────── Form controls ───────────────────────── */

const controlBase =
  "w-full rounded-md border border-line-strong bg-surface text-fg placeholder:text-fg-faint " +
  "transition-[border-color,box-shadow] duration-150 " +
  "hover:border-fg-faint focus:border-accent focus:outline-none focus:shadow-[0_0_0_3px_var(--accent-ring)] " +
  "disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(controlBase, "h-9 px-3 text-sm", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(controlBase, "min-h-24 px-3 py-2 text-sm leading-6", className)} {...rest} />;
});

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-fg">
        {label}
      </label>
      {children(id)}
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-fg-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/* ───────────────────────── Tabs ───────────────────────── */

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
  className,
}: {
  items: { id: T; label: string; count?: number }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={cn("flex gap-1 border-b border-line", className)}>
      {items.map((it) => {
        const active = it.id === value;
        return (
          <button
            key={it.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(it.id)}
            className={cn(
              "relative -mb-px h-9 px-3 text-[13px] font-medium transition-colors duration-150",
              "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent",
              active ? "text-fg" : "text-fg-muted hover:text-fg",
            )}
          >
            {it.label}
            {typeof it.count === "number" ? <span className="ml-1.5 text-fg-faint tabular">{it.count}</span> : null}
            {active ? <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent" /> : null}
          </button>
        );
      })}
    </div>
  );
}

/* ───────────────────────── Feedback ───────────────────────── */

export function Callout({ tone = "info", title, children, className }: { tone?: Exclude<Tone, "neutral" | "accent">; title?: string; children: ReactNode; className?: string }) {
  return (
    <div role="note" className={cn("flex gap-3 rounded-lg border px-4 py-3 text-sm", toneClass[tone], "border-current/20", className)}>
      <Dot tone={tone} className="mt-2" />
      <div className="min-w-0 text-fg-2">
        {title ? <p className="font-medium text-fg">{title}</p> : null}
        <div className={title ? "mt-0.5" : ""}>{children}</div>
      </div>
    </div>
  );
}

export function Progress({ value, label, tone = "accent", className }: { value: number; label: string; tone?: Tone; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)} className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)}>
      <div className={cn("h-full rounded-full transition-[width] duration-300 ease-out", dotClass[tone])} style={{ width: `${v}%` }} />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("rounded-md", className)}
      style={{
        background: "linear-gradient(90deg, var(--surface-2) 25%, var(--surface-3) 37%, var(--surface-2) 63%)",
        backgroundSize: "200% 100%",
        animation: "foundry-shimmer 1.6s linear infinite",
      }}
    />
  );
}

/* ───────────────────────── Stat / Code ───────────────────────── */

export function Stat({ label, value, delta, tone, className }: { label: string; value: ReactNode; delta?: string; tone?: Tone; className?: string }) {
  return (
    <div className={cn("grid gap-1.5 px-5 py-4", className)}>
      <span className="label">{label}</span>
      <span className="text-[28px] font-medium leading-none tracking-tight text-fg tabular">{value}</span>
      {delta ? <span className={cn("text-xs font-medium", tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-success")}>{delta}</span> : null}
    </div>
  );
}

export function CodeBlock({ code, language, className }: { code: string; language?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={cn("group relative overflow-hidden rounded-lg border border-line bg-bg-subtle", className)}>
      {language ? <div className="border-b border-line px-4 py-2 label">{language}</div> : null}
      <pre className="overflow-x-auto p-4 text-[13px] leading-6 text-fg-2">
        <code>{code}</code>
      </pre>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(code).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          });
        }}
        className="absolute right-2 top-2 rounded-md border border-line bg-surface px-2 py-1 text-xs text-fg-muted opacity-0 transition-opacity hover:text-fg focus-visible:opacity-100 group-hover:opacity-100"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function Separator({ className }: { className?: string }) {
  return <div role="separator" className={cn("h-px w-full bg-line", className)} />;
}
