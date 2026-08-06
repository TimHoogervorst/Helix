import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

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
  const [collapsed, setCollapsed] = useState(false);

  return (
    <section className="rounded-lg border border-hairline bg-panel">
      <div
        className={`flex items-center gap-2 px-4 py-2.5 ${
          collapsed ? "" : "border-b border-hairline"
        } ${collapsible ? "cursor-pointer select-none" : ""}`}
        onClick={collapsible ? () => setCollapsed(!collapsed) : undefined}
      >
        <span className="text-[13px] font-medium text-foreground">
          {title}
        </span>
        {subtitle && (
          <span className="text-[11px] text-muted-foreground">
            {subtitle}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <div onClick={(e) => e.stopPropagation()}>{actions}</div>
          {collapsible &&
            (collapsed ? (
              <ChevronUp size={14} className="text-muted-foreground" />
            ) : (
              <ChevronDown size={14} className="text-muted-foreground" />
            ))}
        </div>
      </div>
      {!collapsed && (
        <div className={flush ? undefined : "p-4"}>{children}</div>
      )}
    </section>
  );
}
