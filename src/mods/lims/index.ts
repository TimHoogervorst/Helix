import { Cog, FlaskConical } from "lucide-react";
import {
  registerRoute,
  registerSettingsSection,
  registerWorkspace,
} from "../../shell/src/mod-system";
import type { ModManifest } from "../../shell/src/mod-system";
import LimsWorkspacePage from "./workspace/LimsWorkspacePage";
import SchemaSettings from "./settings/SchemaSettings";

export const meta: ModManifest = {
  id: "lims",
  displayName: "LIMS",
  dependsOn: [],
};

export function register() {
  // ── Workspace: LIMS entity workspace ───────────────────────────────────
  // schemaType carries entity type identity so no separate service call is needed.
  registerWorkspace({
    id: "lims",
    displayName: "LIMS",
    icon: FlaskConical,
    schemaType: {
      id: "lims.entity",
      displayName: "LIMS Entity",
      defaultPrefix: "E",
    },
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
    icon: Cog,
    component: SchemaSettings,
    order: 10,
  });
}
