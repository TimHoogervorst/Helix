import { BookOpen, Info, LayoutList } from "lucide-react";
import { Mod } from "../../shell/src/mod-system/Mod";
import type { ModManifest } from "../../shell/src/mod-system/types";
import { SlotSidebar } from "../../shell/src/shared/components/Sidebar/SlotSidebar";
import { SelectionBlock } from "./blocks/SelectionBlock";
import { ViewsBlock } from "./blocks/ViewsBlock";
import LibraryHub from "./hub/LibraryHub";
import manifest from "./modManifest.json";

const mod = new Mod(manifest as ModManifest);

// ── Hub: Library browsing surface ─────────────────────────────────────
mod.registerHub("library", {
  label: "Library",
  icon: BookOpen,
  route: "/library",
  component: LibraryHub,
  order: 10,
  description:
    "Browse, search, and organize your lab's entries, protocols, and folder structure.",
});

// ── Slot: Library Sidebar ──────────────────────────────────────────
export const sidebarSlot = mod.declareSlot("sidebar", {
  accepts: "block",
  renderer: SlotSidebar,
  layout: "vertical",
  order: 0,
  defaults: {},
});

// ── Block: Selection placeholder ───────────────────────────────────
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

// ── Block: Views placeholder ────────────────────────────────────────
export const viewsBlock = mod.registerBlock("views", {
  label: "Views",
  icon: LayoutList,
  component: ViewsBlock,
  listensTo: [],
  onEvent: {},
  emits: [],
  serialize: () => "{}",
  deserialize: () => ({}),
  defaultState: {},
});

// ── Bind blocks into the sidebar slot ──────────────────────────────
mod.registerIntoSlot(sidebarSlot, selectionBlock, {}, 0);
mod.registerIntoSlot(sidebarSlot, viewsBlock, {}, 1);

/** No-op — all registrations happen at module scope via the Mod class. */
export function register() {}
