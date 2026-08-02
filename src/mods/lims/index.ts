import { Cog, Info, LayoutList, Microscope, Users } from "lucide-react";
import { Mod } from "../../shell/src/mod-system/Mod";
import type { ModManifest } from "../../shell/src/mod-system/types";
import { SlotSidebar } from "../../shell/src/shared/components/Sidebar/SlotSidebar";
import LimsWorkspacePage from "./workspace/LimsWorkspacePage";
import SchemaSettings from "./settings/SchemaSettings";
import EntitiesHub from "./hub/EntitiesHub";
import { SelectionBlock } from "./blocks/SelectionBlock";
import { MyViewsBlock } from "./blocks/MyViewsBlock";
import { GlobalViewsBlock } from "./blocks/GlobalViewsBlock";
import manifest from "./modManifest.json";

const mod = new Mod(manifest as ModManifest);

// ── Standalone route: full entity workspace page ──────────────────────
mod.registerRoute("entity-page", {
  path: "/lims/:displayId",
  component: LimsWorkspacePage,
});

// ── Settings: schema CRUD (includes DangerZone) ──────────────────────
mod.registerSettingsSection("schema-settings", {
  label: "Schemas",
  icon: Cog,
  component: SchemaSettings,
  order: 10,
});

// ── Hub: Entities Hub — cross-mod entity browsing surface ─────────────
mod.registerHub("entities", {
  label: "Entities",
  icon: Microscope,
  route: "/entities",
  component: EntitiesHub,
  order: 20,
  description:
    "Browse, search, and filter all entities across every workspace.",
});

// ── Slot: Entities Hub Sidebar ────────────────────────────────────────
export const sidebarSlot = mod.declareSlot("sidebar", {
  accepts: "block",
  renderer: SlotSidebar,
  layout: "vertical",
  order: 0,
  defaults: {},
});

// ── Block: Selection placeholder ──────────────────────────────────────
export const selectionBlock = mod.registerBlock("selection", {
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
export const myViewsBlock = mod.registerBlock("my-views", {
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
export const globalViewsBlock = mod.registerBlock("global-views", {
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

// ── Bind blocks into the sidebar slot ─────────────────────────────────
mod.registerIntoSlot(sidebarSlot, selectionBlock, {}, 0);
mod.registerIntoSlot(sidebarSlot, myViewsBlock, {}, 1);
mod.registerIntoSlot(sidebarSlot, globalViewsBlock, {}, 2);

/** No-op — all registrations happen at module scope via the Mod class. */
export function register() {}
