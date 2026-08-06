import type { ReactNode } from "react";

export type BadgeVariant = "neutral" | "primary" | "success" | "warning" | "destructive";

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  neutral:
    "bg-[var(--color-surface)] text-[var(--color-ink-muted-foreground)] border-[var(--color-ink-hairline)]",
  primary:
    "bg-[color-mix(in_oklch,var(--color-primary),transparent_75%)] text-[var(--color-primary-active)] border-transparent",
  success:
    "bg-[color-mix(in_oklch,var(--color-success),transparent_55%)] text-[var(--color-success-active)] border-transparent",
  warning:
    "bg-[color-mix(in_oklch,var(--color-warning),transparent_75%)] text-[var(--color-warning-active)] border-transparent",
  destructive:
    "bg-[color-mix(in_oklch,var(--color-destructive),transparent_75%)] text-[var(--color-destructive-active)] border-transparent",
};

export function Badge({
  variant = "neutral",
  children,
  className = "",
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 font-[var(--font-label)] text-[11px] font-medium leading-normal ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
