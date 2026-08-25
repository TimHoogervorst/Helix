import type { ReactNode } from "react";
import { Button } from "../../../shell/src/shared/primitives/Button";

interface TabRowProps {
  displayId: string;
  name?: string;
  icon: ReactNode;
  active?: boolean;
  title?: string;
  ariaLabel: string;
  onClick: () => void;
  badge?: ReactNode;
  trailing?: ReactNode;
}

/** Shared rich row for pinned tabs and future history entries. */
export function TabRow({
  displayId,
  name,
  icon,
  active = false,
  title,
  ariaLabel,
  onClick,
  badge,
  trailing,
}: TabRowProps) {
  const primary = name && name !== displayId ? name : displayId;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      <Button
        variant="ghost"
        className={`min-w-0 flex-1 justify-start rounded-md py-0.5 pl-2 text-left${active ? " bg-muted font-medium text-foreground" : ""}`}
        title={title ?? (primary === displayId ? displayId : `${primary} — ${displayId}`)}
        aria-label={ariaLabel}
        onClick={onClick}
      >
        {icon}
        <span className="truncate">{primary}</span>
        {primary !== displayId && (
          <span className="truncate text-xs text-muted-foreground">{displayId}</span>
        )}
        {badge}
      </Button>
      {trailing}
    </div>
  );
}
