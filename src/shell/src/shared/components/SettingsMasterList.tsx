import { useState } from "react";
import { Search } from "lucide-react";
import type { ReactNode } from "react";

export interface MasterListRow {
  id: string | number;
  label: string;
  secondary?: string;
  icon?: ReactNode;
  iconBg?: string;
  iconFg?: string;
  dirty?: boolean;
}

interface SettingsMasterListProps {
  rows: MasterListRow[];
  selectedId?: string | number | null;
  filterValue: string;
  onFilterChange: (value: string) => void;
  onSelect: (id: string | number) => void;
  filterPlaceholder?: string;
  actions?: ReactNode;
}

export function SettingsMasterList({
  rows,
  selectedId,
  filterValue,
  onFilterChange,
  onSelect,
  filterPlaceholder = "Filter…",
  actions,
}: SettingsMasterListProps) {
  const [localFilter, setLocalFilter] = useState(filterValue);

  const handleFilterChange = (value: string) => {
    setLocalFilter(value);
    onFilterChange(value);
  };

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center gap-2 py-2">
        <Search size={12} className="shrink-0 text-[var(--color-ink-muted-foreground)]" />
        <input
          type="text"
          className="w-full bg-transparent text-[13px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted-foreground)] outline-none"
          placeholder={filterPlaceholder}
          value={localFilter}
          onChange={(e) => handleFilterChange(e.target.value)}
        />
        {actions}
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        <div className="overflow-hidden rounded-lg border border-[var(--color-ink-hairline)] bg-[var(--color-surface)]">
          {rows.map((row, i) => (
            <button
              key={row.id}
              type="button"
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] transition-colors border-0 bg-transparent ${
                i < rows.length - 1 ? "border-b border-[var(--color-ink-hairline)]" : ""
              } ${
                selectedId === row.id
                  ? "bg-[var(--color-primary-subtle)] font-medium text-[var(--color-ink)]"
                  : "text-[var(--color-ink-muted-foreground)] hover:bg-[var(--color-surface-hover)]"
              }`}
              onClick={() => onSelect(row.id)}
            >
              {row.icon && (
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center ${row.iconBg ?? "bg-[var(--color-surface-hover)]"} ${row.iconFg ?? "text-[var(--color-ink-muted-foreground)]"}`}
                >
                  {row.icon}
                </span>
              )}
              <span className="flex-1 truncate">{row.label}</span>
              {row.secondary && (
                <span className="shrink-0 font-[var(--font-label)] text-[10px] text-[var(--color-ink-muted-foreground)]">
                  {row.secondary}
                </span>
              )}
              {row.dirty && (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-primary)]" />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
