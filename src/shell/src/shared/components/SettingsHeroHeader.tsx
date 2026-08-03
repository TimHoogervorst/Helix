import type { ReactNode } from "react";

interface SettingsHeroHeaderProps {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function SettingsHeroHeader({
  eyebrow,
  title,
  description,
  actions,
}: SettingsHeroHeaderProps) {
  return (
    <div className="flex flex-col gap-2 pb-6">
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {eyebrow}
      </span>
      <h1 className="font-serif text-3xl tracking-tight text-foreground">
        {title}
      </h1>
      {description && (
        <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
          {description}
        </p>
      )}
      {actions && (
        <div className="flex items-center gap-2 pt-1">
          {actions}
        </div>
      )}
    </div>
  );
}
