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
  dragHandle?: ReactNode;
  dragHandleColor?: string;
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
  dragHandle,
  dragHandleColor,
}: TabRowProps) {
  const primary = name && name !== displayId ? name : displayId;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
      <Button
        variant="ghost"
        className={`min-w-0 flex-1 justify-start gap-1 rounded-md px-2 py-0 text-left text-sm h-7${active ? " bg-muted font-medium text-foreground" : ""}`}
        title={title ?? (primary === displayId ? displayId : `${primary} — ${displayId}`)}
        aria-label={ariaLabel}
        onClick={onClick}
      >
        <span className="relative grid h-6 w-6 shrink-0 place-items-center [&>svg]:h-3.5 [&>svg]:w-3.5">
          <span className={dragHandle ? "group-hover:hidden" : ""}>{icon}</span>
          {dragHandle && <span className="hidden group-hover:block" style={{ color: dragHandleColor }} onClick={(event) => event.stopPropagation()}>{dragHandle}</span>}
        </span>
        <span className="min-w-0 flex-1 truncate">{primary}</span>
        {primary !== displayId && (
          <span className="min-w-0 max-w-[40%] shrink truncate text-xs text-muted-foreground">{displayId}</span>
        )}
        {badge}
      </Button>
      {trailing}
    </div>
  );
}
