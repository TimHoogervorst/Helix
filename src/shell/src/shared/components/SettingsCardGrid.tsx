import { useState, Children, type ReactNode } from "react";
import { Search } from "lucide-react";

interface SettingsCardGridProps {
  filterValue: string;
  onFilterChange: (value: string) => void;
  filterPlaceholder?: string;
  emptyMessage?: string;
  children: ReactNode;
}

export function SettingsCardGrid({
  filterValue,
  onFilterChange,
  filterPlaceholder = "Filter...",
  emptyMessage = "No items found.",
  children,
}: SettingsCardGridProps) {
  const [localFilter, setLocalFilter] = useState(filterValue);

  const handleFilterChange = (value: string) => {
    setLocalFilter(value);
    onFilterChange(value);
  };

  const hasChildren = Children.count(children) > 0;

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center gap-2 py-2">
        <Search size={12} className="shrink-0 text-muted-foreground" />
        <input
          type="text"
          className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          placeholder={filterPlaceholder}
          value={localFilter}
          onChange={(e) => handleFilterChange(e.target.value)}
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {hasChildren ? (
          <div className="grid grid-cols-2 gap-3 py-1 sm:grid-cols-3 lg:grid-cols-4">
            {children}
          </div>
        ) : (
          <p className="py-4 text-center text-xs text-muted-foreground">
            {emptyMessage}
          </p>
        )}
      </div>
    </div>
  );
}
