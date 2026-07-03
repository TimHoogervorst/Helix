import { lazy } from "react";
import { Tag } from "lucide-react";
import {
  registerWorkspace,
  registerRoute,
  registerSettingsSection,
} from "../../core/mod-system";
import ElnDetailCard from "./console/ElnDetailCard";

export const meta = {
  id: "eln",
  displayName: "ELN",
  dependsOn: ["lims"] as string[],
};

export function register() {
  // ── Console: ELN entry list at /eln ────────────────────────────────────
  // REMOVED from UI — keep the component for potential future use.
  // registerConsole({
  //   id: "eln",
  //   label: "Entries",
  //   icon: NotebookText,
  //   route: "/eln",
  //   component: lazy(() => import("./console/ElnConsole")),
  //   order: 10,
  //   defaults: {},
  //   accepts: { only: ["eln.entry"] },
  // });

  // ── Workspace: ELN entry detail / full-page editor ─────────────────────
  registerWorkspace({
    id: "eln.entry",
    label: "Entry",
    consoleIds: ["library"],
    route: "/eln/:displayId",
    detailCard: ElnDetailCard,
    workspace: lazy(() => import("./workspace/ElnWorkspace")),
  });

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
