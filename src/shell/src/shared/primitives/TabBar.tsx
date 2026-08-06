import type { ReactNode } from "react";

export interface Tab {
  id: string;
  label: ReactNode;
  testId?: string;
}

interface TabBarProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
}

export function TabBar({
  tabs,
  activeTab,
  onTabChange,
  className = "",
}: TabBarProps) {
  return (
    <div
      className={`inline-flex rounded-lg bg-[var(--color-background)] ${className}`}
      role="tablist"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          data-testid={tab.testId}
          aria-selected={tab.id === activeTab}
          className={`border-0 px-4 py-2 font-[var(--font-label)] text-[12px] font-medium transition-colors first:rounded-l-lg last:rounded-r-lg ${
            tab.id === activeTab
              ? "bg-[var(--color-surface)] text-[var(--color-ink)] font-semibold"
              : "bg-transparent text-[var(--color-ink-muted-foreground)] hover:text-[var(--color-ink)] hover:bg-[var(--color-background-hover)]"
          }`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
