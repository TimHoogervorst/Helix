import { useState, useEffect } from "react";
import { ModRegistry } from "../../../core/mod-system/ModRegistry";

function SettingsPage() {
  const sections = ModRegistry.getInstance().getSettingsSections();

  // Auto-select the first section on mount / when sections change
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (sections.length > 0) {
      // Keep current selection if still valid, otherwise pick first
      setSelectedId((prev) =>
        prev && sections.some((s) => s.id === prev) ? prev : sections[0].id,
      );
    }
  }, [sections]);

  // ── Empty state ──────────────────────────────────────────────────────────
  if (sections.length === 0) {
    return (
      <div className="page settings-page">
        <div className="empty">No settings available.</div>
      </div>
    );
  }

  const selectedSection = sections.find((s) => s.id === selectedId) ?? sections[0];
  const SelectedComponent = selectedSection.component;

  return (
    <div className="page settings-page">
      <div className="settings-layout">
        {/* Left sidebar nav — section labels */}
        <nav className="settings-nav border-r border-hairline w-56 shrink-0 overflow-y-auto p-2">
          {sections.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                className={`btn-ghost flex w-full items-center gap-2 rounded-md py-1.5 pl-3 pr-2 text-left text-[13px]${
                  s.id === selectedSection.id
                    ? " bg-muted font-medium text-foreground"
                    : ""
                }`}
                onClick={() => setSelectedId(s.id)}
                aria-label={s.label}
              >
                {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                {s.label}
              </button>
            );
          })}
        </nav>

        {/* Right panel — selected section's component */}
        <div className="settings-content flex-1 min-w-0 overflow-y-auto">
          <SelectedComponent />
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
