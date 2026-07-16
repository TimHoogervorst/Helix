import { useSearchParams } from "react-router-dom";
import { Suspense } from "react";
import { ModRegistry } from "../../../shell/src/mod-system/ModRegistry";
import { ErrorBoundary } from "../../../shell/src/shared/components/ErrorBoundary";

function SettingsSectionFallback() {
  return (
    <div
      className="flex min-h-[40vh] items-center justify-center"
      data-testid="settings-section-loading-fallback"
    >
      <p className="text-[13px] text-muted-foreground">Loading settings…</p>
    </div>
  );
}

function SettingsPage() {
  const [searchParams] = useSearchParams();
  const sections = ModRegistry.getInstance().getSettingsSections();

  // Read the active section from the URL search param, fall back to the first section
  const sectionId =
    searchParams.get("section") ?? sections[0]?.id ?? null;

  // ── Empty state ──────────────────────────────────────────────────────────
  if (sections.length === 0) {
    return (
      <div className="flex flex-1 flex-col min-h-0">
        <div className="empty">No settings available.</div>
      </div>
    );
  }

  const selectedSection =
    sections.find((s) => s.id === sectionId) ?? sections[0];
  const SelectedComponent = selectedSection.component;

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <ErrorBoundary key={sectionId}>
        <Suspense fallback={<SettingsSectionFallback />}>
          <SelectedComponent />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}

export default SettingsPage;
