import { Cog } from "lucide-react";
import {
  registerRoute,
  registerSettingsSection,
  registerWorkspace,
  ModRegistry,
} from "../../core/mod-system";
import type { RegisteredEntityType } from "../../core/mod-system";
import LimsWorkspacePage from "./workspace/LimsWorkspacePage";
import SchemaSettings from "./settings/SchemaSettings";

export const meta = {
  id: "lims",
  displayName: "LIMS",
  dependsOn: [],
};

export function register() {
  // ── Workspace: LIMS entity workspace ───────────────────────────────────
  registerWorkspace({ id: "lims", displayName: "LIMS" });

  // ── Service: entity type registry ──────────────────────────────────────
  // LIMS is the central registry for all mentionable entity types.
  // Mods call registry.call("lims.registerEntityType", config) at boot
  // to declare which entity types they own.
  const entityTypes = new Map<string, RegisteredEntityType>();

  ModRegistry.getInstance().registerService({
    id: "lims.registerEntityType",
    handler: async (config: unknown) => {
      const typed = config as RegisteredEntityType;
      if (!typed || typeof typed.prefix !== "string") {
        throw new Error(
          "lims.registerEntityType: config must have a 'prefix' property.",
        );
      }
      if (entityTypes.has(typed.prefix)) {
        const existing = entityTypes.get(typed.prefix)!;
        throw new Error(
          `Duplicate entity type prefix '${typed.prefix}': ` +
            `'${existing.entityType}' is already registered ` +
            `(attempted: '${typed.entityType}').`,
        );
      }
      entityTypes.set(typed.prefix, typed);
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
