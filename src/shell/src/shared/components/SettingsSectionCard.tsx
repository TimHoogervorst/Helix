import { useState, type ReactNode } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";

interface SettingsSectionCardProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  collapsible?: boolean;
}

export function SettingsSectionCard({
  title,
  subtitle,
  actions,
  children,
  flush = false,
  collapsible = true,
}: SettingsSectionCardProps) {
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-lg border border-[var(--color-ink-hairline)] bg-[var(--color-surface)]">
      <button
        type="button"
        className="border-0 bg-transparent flex w-full items-center gap-2 px-4 py-2.5 font-[var(--font-label)] text-[13px] font-medium text-[var(--color-ink)] hover:bg-[var(--color-background-hover)] transition-colors rounded-t-lg"
        onClick={collapsible ? () => setOpen(!open) : undefined}
      >
        <span>{title}</span>
        {subtitle && (
          <span className="text-[11px] font-normal text-[var(--color-ink-muted-foreground)]">
            {subtitle}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span onClick={(e) => e.stopPropagation()}>{actions}</span>
          {collapsible && (
            <span className="text-[var(--color-ink-muted-foreground)]">
              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
          )}
        </div>
      </button>
      {open && (
        <div className={flush ? undefined : "px-4 pb-4 pt-1"}>{children}</div>
      )}
    </div>
  );
}
