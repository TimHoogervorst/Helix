import { Cog, Database, Info, LayoutList, Users } from "lucide-react";
import type { Mod } from "@helix/mod-api";
import { SlotSidebar } from "../../shell/src/shared/components/Sidebar/SlotSidebar";
import LimsWorkspacePage from "./workspace/LimsWorkspacePage";
import SchemaSettings from "./settings/SchemaSettings";
import { SelectionBlock } from "./blocks/SelectionBlock";
import { MyViewsBlock } from "./blocks/MyViewsBlock";
import { GlobalViewsBlock } from "./blocks/GlobalViewsBlock";
import { ActivityFeedBlock } from "./blocks/ActivityFeedBlock";
import ResultsTab from "./workspace/ResultsTab";
import { patch } from "../../shell/src/api/client";

export function register(mod: Mod) {
mod.registerContentSource("entity", {
  label: "Entity",
  edit: (displayId, changes) => patch(`/lims/entities/${displayId}/`, changes),
  navigate: (displayId, params) => {
    const query = params.toString();
    return `/lims/${displayId}${query ? `?${query}` : ""}`;
  },
});

mod.registerSchemaComponent("results", {
  label: "Results",
  icon: Database,
  component: ResultsTab,
  order: 10,
});

// ── Standalone route: full entity workspace page ──────────────────────
mod.registerWorkspace("lims", {
  component: LimsWorkspacePage,
});

// ── Settings: schema CRUD ───────────────────────────────────────────
mod.registerSettingsSection("schema-settings", {
  label: "Schemas",
  icon: Cog,
  component: SchemaSettings,
  order: 10,
});

// ── Slot: Entities Hub Sidebar ────────────────────────────────────────
const sidebarSlot = mod.declareSlot("sidebar", {
  accepts: "block",
  renderer: SlotSidebar,
  layout: "vertical",
  order: 0,
  defaults: {},
});

// ── Block: Selection placeholder ──────────────────────────────────────
const selectionBlock = mod.registerBlock("selection", {
  label: "Selection",
  icon: Info,
  component: SelectionBlock,
  listensTo: [],
  onEvent: {},
  emits: [],
  serialize: () => "{}",
  deserialize: () => ({}),
  defaultState: {},
});

// ── Block: My Views placeholder ───────────────────────────────────────
const myViewsBlock = mod.registerBlock("my-views", {
  label: "My Views",
  icon: LayoutList,
  component: MyViewsBlock,
  listensTo: [],
  onEvent: {},
  emits: [],
  serialize: () => "{}",
  deserialize: () => ({}),
  defaultState: {},
});

// ── Block: Global Views placeholder ───────────────────────────────────
const globalViewsBlock = mod.registerBlock("global-views", {
  label: "Global Views",
  icon: Users,
  component: GlobalViewsBlock,
  listensTo: [],
  onEvent: {},
  emits: [],
  serialize: () => "{}",
  deserialize: () => ({}),
  defaultState: {},
});

// ── Block: Entity Activity Feed ─────────────────────────────────────────
const activityFeedBlock = mod.registerBlock("activity-feed", {
  label: "Activity Feed",
  icon: History,
  component: ActivityFeedBlock,
  listensTo: [],
  onEvent: {},
  emits: [],
  serialize: () => "{}",
  deserialize: () => ({}),
  defaultState: {},
});

// ── Bind blocks into the sidebar slot ─────────────────────────────────
mod.registerIntoSlot(sidebarSlot, selectionBlock, {}, 0);
mod.registerIntoSlot(sidebarSlot, myViewsBlock, {}, 1);
mod.registerIntoSlot(sidebarSlot, globalViewsBlock, {}, 2);

}
