import type { ReactNode } from "react";

interface SettingsSectionCardProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function SettingsSectionCard({
  title,
  subtitle,
  actions,
  children,
}: SettingsSectionCardProps) {
  return (
    <section className="rounded-lg border border-hairline bg-panel">
      <div className="flex items-center gap-2 border-b border-hairline px-4 py-2.5">
        <span className="text-[13px] font-medium text-foreground">
          {title}
        </span>
        {subtitle && (
          <span className="text-[11px] text-muted-foreground">
            {subtitle}
          </span>
        )}
        {actions && (
          <div className="ml-auto flex items-center gap-2">
            {actions}
          </div>
        )}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
