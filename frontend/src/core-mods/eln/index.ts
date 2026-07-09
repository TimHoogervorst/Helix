import { lazy } from "react";
import { FlaskConical } from "lucide-react";
import {
  registerRoute,
  registerLibraryItem,
  registerWorkspace,
} from "../../core/mod-system";
import ElnLibraryCard from "./library/ElnLibraryCard";

export const meta = {
  id: "eln",
  displayName: "ELN",
  dependsOn: ["lims", "tags"] as string[],
};

export function register() {
  // ── Workspace: ELN notebook workspace ───────────────────────────────────
  registerWorkspace({ id: "eln", displayName: "ELN" });

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
}
