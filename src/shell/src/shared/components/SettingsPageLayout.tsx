import type { ReactNode } from "react";

interface SettingsPageLayoutProps {
  children: ReactNode;
  hero?: ReactNode;
  bottomBar?: ReactNode;
}

export function SettingsPageLayout({
  children,
  hero,
  bottomBar,
}: SettingsPageLayoutProps) {
  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex-1 overflow-y-auto">
        {hero && (
          <div className="grid-paper border-b border-hairline pb-6 pt-10">
            <div className="mx-auto max-w-6xl px-8">{hero}</div>
          </div>
        )}
        <div className="mx-auto w-full max-w-6xl px-8 pb-12">
          {children}
        </div>
      </div>
      {bottomBar && (
        <div className="border-t border-hairline bg-panel/95 backdrop-blur-sm">
          <div className="mx-auto max-w-6xl px-8 py-3">
            {bottomBar}
          </div>
        </div>
      )}
    </div>
  );
}
