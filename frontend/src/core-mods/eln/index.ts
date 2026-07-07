import { lazy } from "react";
import { Tag, FlaskConical } from "lucide-react";
import {
  registerRoute,
  registerSettingsSection,
  registerLibraryItem,
} from "../../core/mod-system";
import ElnLibraryCard from "./library/ElnLibraryCard";

export const meta = {
  id: "eln",
  displayName: "ELN",
  dependsOn: ["lims"] as string[],
};

export function register() {
  // ── Standalone route: new entry page ──────────────────────────────────
  registerRoute({
    id: "eln.new-entry",
    modId: "eln",
    path: "/eln/new",
    component: lazy(() => import("./workspace/ElnWorkspacePage")),
  });

  // ── Standalone route: entry detail page (full workspace) ──────────────
  registerRoute({
    id: "eln.entry-page",
    modId: "eln",
    path: "/eln/:id",
    component: lazy(() => import("./workspace/ElnWorkspacePage")),
  });

  // ── Library: ELN entry card ──────────────────────────────────────────
  registerLibraryItem({
    id: "eln.entry",
    icon: FlaskConical,
    listCard: ElnLibraryCard,
    property_fields: [
      { key: "samples_count" },
      { key: "attachments_count" },
    ],
  });

  // ── Settings: Tag management ──────────────────────────────────────────
  registerSettingsSection({
    id: "eln.tags",
    modId: "eln",
    label: "Tags",
    icon: Tag,
    component: lazy(() => import("./settings/TagSettings")),
    order: 20,
  });
}
