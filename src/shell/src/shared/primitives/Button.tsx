import type { ReactNode, ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-[11px] gap-1",
  md: "h-8 px-3 text-[12px] gap-1.5",
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "text-[var(--color-primary-foreground)] bg-[var(--color-primary)] border-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] hover:border-[var(--color-primary-hover)] active:bg-[var(--color-primary-active)] active:border-[var(--color-primary-active)]",
  ghost:
    "text-[var(--color-ink)] bg-transparent border-transparent hover:bg-[var(--color-surface-hover)] hover:border-transparent active:bg-[var(--color-surface-active)] active:border-transparent",
  destructive:
    "text-[var(--color-destructive-foreground)] bg-[var(--color-destructive)] border-[var(--color-destructive)] hover:bg-[var(--color-destructive-hover)] hover:border-[var(--color-destructive-hover)] active:bg-[var(--color-destructive-active)] active:border-[var(--color-destructive-active)]",
};

export function Button({
  variant = "primary",
  size = "md",
  children,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-md border font-medium font-[var(--font-body)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
