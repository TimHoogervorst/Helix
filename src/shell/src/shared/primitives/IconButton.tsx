import type { ButtonHTMLAttributes, ReactNode } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  "aria-label": string;
  children: ReactNode;
}

export function IconButton({
  children,
  className = "",
  ...props
}: IconButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center h-9 w-9 rounded-md border border-transparent bg-transparent text-[var(--color-ink-muted-foreground)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)] active:bg-[var(--color-surface-active)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
