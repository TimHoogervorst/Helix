import { useState } from "react";
import { Search } from "lucide-react";
import type { ReactNode } from "react";

export interface MasterListRow {
  id: string | number;
  label: string;
  secondary?: string;
  icon?: ReactNode;
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
    <div className="flex flex-col min-h-0 border-r border-hairline bg-surface">
      <div className="flex items-center gap-1 border-b border-hairline px-3 py-2">
        <Search size={13} className="shrink-0 text-muted-foreground" />
        <input
          type="text"
          className="w-full bg-transparent text-[12px] text-foreground placeholder:text-muted-foreground outline-none"
          placeholder={filterPlaceholder}
          value={localFilter}
          onChange={(e) => handleFilterChange(e.target.value)}
        />
        {actions && (
          <div className="flex items-center gap-1">{actions}</div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] transition-colors hover:bg-muted/50 ${
              selectedId === row.id
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground"
            }`}
            onClick={() => onSelect(row.id)}
          >
            {row.icon && (
              <span className="grid h-5 w-5 shrink-0 place-items-center">
                {row.icon}
              </span>
            )}
            <span className="flex-1 truncate">{row.label}</span>
            {row.secondary && (
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                {row.secondary}
              </span>
            )}
            {row.dirty && (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
