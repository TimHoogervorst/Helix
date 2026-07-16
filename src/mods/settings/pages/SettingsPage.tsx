import { useSearchParams } from "react-router-dom";
import { ModRegistry } from "../../../shell/src/mod-system/ModRegistry";

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
      <SelectedComponent />
    </div>
  );
}

export default SettingsPage;
