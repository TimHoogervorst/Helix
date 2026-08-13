import { useState, useCallback, type ReactNode, type KeyboardEvent } from "react";
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

  const handleToggle = useCallback(() => {
    if (collapsible) setOpen(!open);
  }, [collapsible, open]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleToggle();
      }
    },
    [handleToggle],
  );

  return (
    <div className="rounded-lg border border-[var(--color-ink-hairline)] bg-[var(--color-card)]">
      <div
        role="button"
        tabIndex={collapsible ? 0 : undefined}
        className="border-0 bg-transparent flex w-full items-center gap-2 px-4 py-2.5 font-[var(--font-label)] text-base font-medium text-[var(--color-ink)] hover:bg-[var(--color-background-hover)] transition-colors rounded-t-lg cursor-pointer"
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
      >
        <span>{title}</span>
        {subtitle && (
          <span className="text-xs font-normal text-[var(--color-ink-muted-foreground)]">
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
      </div>
      {open && (
        <div className={flush ? undefined : "px-4 pb-4 pt-1"}>{children}</div>
      )}
    </div>
  );
}
