import { BookOpen, Info, LayoutList } from "lucide-react";
import {
  registerHub,
  declareSlot,
  registerBlock,
  registerIntoSlot,
} from "../../shell/src/mod-system";
import { SlotSidebar } from "../../shell/src/shared/components/Sidebar/SlotSidebar";
import { SelectionBlock } from "./blocks/SelectionBlock";
import { ViewsBlock } from "./blocks/ViewsBlock";
import LibraryHub from "./hub/LibraryHub";

export function register() {
  // ── Hub: Library browsing surface ─────────────────────────────────────
  registerHub({
    id: "library",
    label: "Library",
    icon: BookOpen,
    route: "/library",
    component: LibraryHub,
    order: 10,
    description:
      "Browse, search, and organize your lab's entries, protocols, and folder structure.",
  });

  // ── Slot: Library Sidebar ──────────────────────────────────────────
  declareSlot({
    id: "library.sidebar",
    accepts: "block",
    renderer: SlotSidebar,
    layout: "vertical",
    order: 0,
    defaults: {},
  });

  // ── Block: Selection placeholder ───────────────────────────────────
  registerBlock({
    id: "library.selection-block",
    label: "Selection",
    icon: Info,
    component: SelectionBlock,
    listensTo: [],
    onEvent: {},
    serialize: () => "{}",
    deserialize: () => ({}),
    defaultState: {},
  });

  // ── Block: Views placeholder ────────────────────────────────────────
  registerBlock({
    id: "library.views-block",
    label: "Views",
    icon: LayoutList,
    component: ViewsBlock,
    listensTo: [],
    onEvent: {},
    serialize: () => "{}",
    deserialize: () => ({}),
    defaultState: {},
  });

  // ── Bind blocks into the sidebar slot ──────────────────────────────
  registerIntoSlot("library.sidebar", "library.selection-block", {}, 0);
  registerIntoSlot("library.sidebar", "library.views-block", {}, 1);
}
