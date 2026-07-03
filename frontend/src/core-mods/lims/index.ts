import { Database } from "lucide-react";
import {
  registerConsole,
  registerWorkspace,
  registerRoute,
  registerSettingsSection,
} from "../../core/mod-system";
import LimsConsole from "./console/LimsConsole";
import LimsDetailCard from "./console/LimsDetailCard";
import LimsWorkspace from "./workspace/LimsWorkspace";
import LimsWorkspacePage from "./workspace/LimsWorkspacePage";
import SchemaSettings from "./settings/SchemaSettings";

export const meta = {
  id: "lims",
  displayName: "LIMS",
  dependsOn: [],
};

export function register() {
  // ── Console: main LIMS browsing surface ───────────────────────────────
  registerConsole({
    id: "lims",
    label: "Database",
    icon: Database,
    route: "/lims",
    component: LimsConsole,
    order: 30,
    defaults: {
      detailCard: LimsDetailCard,
      workspace: LimsWorkspace,
    },
    accepts: { except: ["eln.entry"] },
  });

  // ── Workspace: entity item type for the LIMS console ──────────────────
  registerWorkspace({
    id: "lims.entity",
    label: "Entity",
    consoleIds: ["lims"],
    route: "/lims/:displayId",
    detailCard: LimsDetailCard,
    workspace: LimsWorkspace,
  });

  // ── Standalone route: full entity workspace page ──────────────────────
  registerRoute({
    id: "lims.entity-page",
    modId: "lims",
    path: "/lims/:displayId",
    component: LimsWorkspacePage,
  });

  // ── Settings: schema CRUD (includes DangerZone) ──────────────────────
  registerSettingsSection({
    id: "lims.schema-settings",
    modId: "lims",
    label: "Schemas",
    component: SchemaSettings,
    order: 10,
  });
}
