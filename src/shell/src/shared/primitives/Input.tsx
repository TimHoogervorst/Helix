import type { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from "react";

const FIELD_BASE =
  "w-full rounded-md border border-[var(--color-ink-border)] bg-[var(--color-surface)] text-[var(--color-ink)] font-[var(--font-body)] text-[13px] placeholder:text-[var(--color-ink-muted-foreground)] outline-none transition-colors focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-focus-ring)] disabled:opacity-50 disabled:cursor-not-allowed";

export function Input({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="text"
      className={`${FIELD_BASE} h-9 px-3 ${className}`}
      {...props}
    />
  );
}

export function Textarea({
  className = "",
  rows = 3,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`${FIELD_BASE} px-3 py-2 resize-y ${className}`}
      rows={rows}
      {...props}
    />
  );
}

export function Select({
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`${FIELD_BASE} h-9 px-3 appearance-none cursor-pointer ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}
