import type { ReactNode } from "react";

export function Table({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-lg border border-[var(--color-ink-hairline)] ${className}`}>
      <table className="w-full border-collapse">{children}</table>
    </div>
  );
}

export function TableHead({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-[var(--color-surface)] border-b border-[var(--color-ink-hairline)]">
      {children}
    </thead>
  );
}

export function TableRow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <tr
      className={`border-b border-[var(--color-ink-hairline)] last:border-b-0 hover:bg-[var(--color-background-hover)] transition-colors ${className}`}
    >
      {children}
    </tr>
  );
}

export function TableHeaderCell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <th
      className={`px-4 py-2.5 text-left font-[var(--font-label)] text-xs font-semibold text-[var(--color-ink-muted-foreground)] uppercase tracking-wider ${className}`}
    >
      {children}
    </th>
  );
}

export function TableCell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <td
      className={`px-4 py-2.5 font-[var(--font-body)] text-base text-[var(--color-ink)] ${className}`}
    >
      {children}
    </td>
  );
}
