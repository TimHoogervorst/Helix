import { Cog, FlaskConical, Info, LayoutList, Microscope, Users } from "lucide-react";
import {
  registerRoute,
  registerSettingsSection,
  registerWorkspace,
  registerHub,
  declareSlot,
  registerBlock,
  registerIntoSlot,
} from "../../shell/src/mod-system";
import type { ModManifest } from "../../shell/src/mod-system";
import { SlotSidebar } from "../../shell/src/shared/components/Sidebar/SlotSidebar";
import LimsWorkspacePage from "./workspace/LimsWorkspacePage";
import SchemaSettings from "./settings/SchemaSettings";
import EntitiesHub from "./hub/EntitiesHub";
import { SelectionBlock } from "./blocks/SelectionBlock";
import { MyViewsBlock } from "./blocks/MyViewsBlock";
import { GlobalViewsBlock } from "./blocks/GlobalViewsBlock";

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

  // ── Hub: Entities Hub — cross-mod entity browsing surface ─────────────
  registerHub({
    id: "entities",
    label: "Entities",
    icon: Microscope,
    route: "/entities",
    component: EntitiesHub,
    order: 20,
    description:
      "Browse, search, and filter all entities across every workspace.",
  });

  // ── Slot: Entities Hub Sidebar ────────────────────────────────────────
  declareSlot({
    id: "entities.sidebar",
    accepts: "block",
    renderer: SlotSidebar,
    layout: "vertical",
    order: 0,
    defaults: {},
  });

  // ── Block: Selection placeholder ──────────────────────────────────────
  registerBlock({
    id: "entities.selection-block",
    label: "Selection",
    icon: Info,
    component: SelectionBlock,
    listensTo: [],
    onEvent: {},
    serialize: () => "{}",
    deserialize: () => ({}),
    defaultState: {},
  });

  // ── Block: My Views placeholder ───────────────────────────────────────
  registerBlock({
    id: "entities.my-views-block",
    label: "My Views",
    icon: LayoutList,
    component: MyViewsBlock,
    listensTo: [],
    onEvent: {},
    serialize: () => "{}",
    deserialize: () => ({}),
    defaultState: {},
  });

  // ── Block: Global Views placeholder ───────────────────────────────────
  registerBlock({
    id: "entities.global-views-block",
    label: "Global Views",
    icon: Users,
    component: GlobalViewsBlock,
    listensTo: [],
    onEvent: {},
    serialize: () => "{}",
    deserialize: () => ({}),
    defaultState: {},
  });

  // ── Bind blocks into the sidebar slot ─────────────────────────────────
  registerIntoSlot("entities.sidebar", "entities.selection-block", {}, 0);
  registerIntoSlot("entities.sidebar", "entities.my-views-block", {}, 1);
  registerIntoSlot("entities.sidebar", "entities.global-views-block", {}, 2);
}
