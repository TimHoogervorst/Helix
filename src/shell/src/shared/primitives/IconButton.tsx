import type { ButtonHTMLAttributes, ReactNode } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  "aria-label": string;
  children: ReactNode;
  variant?: "ghost" | "primary";
  size?: "sm" | "md";
}

export function IconButton({
  children,
  variant = "ghost",
  size = "md",
  className = "",
  style,
  ...props
}: IconButtonProps) {
  const variantClasses = variant === "primary"
    ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:bg-[var(--color-primary-hover)] hover:text-[var(--color-primary-foreground)] active:bg-[var(--color-primary-active)]"
    : "bg-transparent text-[var(--color-ink-muted-foreground)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)] active:bg-[var(--color-surface-active)]";
  const sizeClasses = size === "sm" ? "h-8 w-8" : "h-9 w-9";

  return (
    <button
      className={`inline-flex items-center justify-center ${sizeClasses} rounded-md border border-transparent ${variantClasses} transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      style={{
        ...(size === "sm" ? { width: "1.75rem", height: "1.75rem" } : {}),
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  );
}
