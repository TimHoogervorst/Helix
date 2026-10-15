import { BookOpen, Info, LayoutList } from "lucide-react";
import type { Mod } from "@helix/mod-api";
import { SlotSidebar } from "../../../shell/src/shared/components/Sidebar/SlotSidebar";
import { SelectionBlock } from "./blocks/SelectionBlock";
import { ViewsBlock } from "./blocks/ViewsBlock";
import LibraryHub from "./hub/LibraryHub";
// ── Hub: Library browsing surface ─────────────────────────────────────
export function register(mod: Mod) {
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
const sidebarSlot = mod.declareSlot("sidebar", {
  accepts: "block",
  renderer: SlotSidebar,
  layout: "vertical",
  order: 0,
  defaults: {},
});

// ── Block: Selection placeholder ───────────────────────────────────
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

// ── Block: Views placeholder ────────────────────────────────────────
const viewsBlock = mod.registerBlock("views", {
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

}
