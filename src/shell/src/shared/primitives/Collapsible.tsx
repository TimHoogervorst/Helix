import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface CollapsibleProps {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export function Collapsible({
  title,
  children,
  defaultOpen = false,
  className = "",
}: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className={`rounded-lg border border-[var(--color-ink-hairline)] bg-[var(--color-card)] ${className}`}
    >
      <button
        type="button"
        className="border-0 bg-transparent flex w-full items-center justify-between px-4 py-2.5 font-[var(--font-label)] text-base font-medium text-[var(--color-ink)] hover:bg-[var(--color-background-hover)] transition-colors rounded-t-lg"
        onClick={() => setOpen(!open)}
      >
        <span>{title}</span>
        <span className="text-[var(--color-ink-muted-foreground)]">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>
      {open && <div className="px-4 pb-4 pt-1">{children}</div>}
    </div>
  );
}
