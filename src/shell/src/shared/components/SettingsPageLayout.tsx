import type { ReactNode } from "react";

interface SettingsPageLayoutProps {
  children: ReactNode;
}

export function SettingsPageLayout({ children }: SettingsPageLayoutProps) {
  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="grid-paper px-8 py-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </div>
    </div>
  );
}
