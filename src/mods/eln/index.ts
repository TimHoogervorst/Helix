import { lazy } from "react";
import { ListChecks, History, Table, Info, Link, Paperclip } from "lucide-react";
import type { Mod } from "@helix/mod-api";
import { ButtonGroupRenderer } from "../../shell/src/workspace/ButtonGroupRenderer";
import { SlotSidebar } from "../../shell/src/shared/components/Sidebar/SlotSidebar";
import { TipTapRenderer } from "../../shell/src/workspace/TipTapRenderer";
import { TableBlockComponent } from "./blocks/TableNodeView";
import { ActivityFeedBlock, activityFeedOnEvent } from "./components/ActivityFeedBlock";
import { MetadataBlock } from "./blocks/MetadataBlock";
import { LinkedEntitiesBlock } from "./blocks/LinkedEntitiesBlock";
import { AttachmentsBlock } from "./blocks/AttachmentsBlock";
import { createEntry, patchEntry, getLockStatus } from "./api";

const emptyEntryContent = { type: "doc", content: [{ type: "paragraph" }] } as const;

export function register(mod: Mod) {

mod.registerContentSource("entry", {
  label: "ELN Entry",
  create: async ({ sourceId, projectId }) => createEntry({
    name: "Untitled entry",
    content: emptyEntryContent,
    source_id: sourceId ?? undefined,
    project: projectId,
  }),
  edit: (displayId, changes) => patchEntry(displayId, changes),
  lock: getLockStatus,
  navigate: (displayId, params) => {
    const query = params.toString();
    return `/eln/${displayId}${query ? `?${query}` : ""}`;
  },
});

// ── Slot: Header actions toolbar (dogfood #227) ──────────────────────────
mod.declareSlot("header-actions", {
  accepts: "button",
  renderer: ButtonGroupRenderer,
  layout: "horizontal",
  order: 0,
  defaults: {},
});

// ── Standalone route: entry detail page (full workspace) ──────────────
mod.registerWorkspace("eln", {
  component: lazy(() => import("./workspace/ElnWorkspacePage")),
});

// ── Slot: ELN Editor ────────────────────────────────────
const editorSlot = mod.declareSlot("editor", {
  accepts: ["editor"],
  renderer: TipTapRenderer,
  layout: "vertical",
  order: 0,
  defaults: {},
});

// ── Block: Table ───────────────────────────────────────────────────────
mod.registerBlock("table", {
  label: "Table",
  layout: "dynamic-bleed",
  icon: Table,
  component: TableBlockComponent,
  listensTo: [],
  onEvent: {},
  emits: [],
  tags: ["data", "spreadsheet"],
  affinity: ["editor"],
  getDisplayName: (attrs) => (attrs.title as string) || "Table",
  serialize: (state) => JSON.stringify(state),
  deserialize: (json) => {
    try { return JSON.parse(json); } catch { return {}; }
  },
  defaultState: {
    title: "Table",
    columns: [
      { id: "col-1", name: "Column 1" },
      { id: "col-2", name: "Column 2" },
    ],
    rows: [
      { id: "row-1", cells: { "col-1": "", "col-2": "" } },
      { id: "row-2", cells: { "col-1": "", "col-2": "" } },
    ],
  },
});

// Table, protocol, and comment blocks are platform-owned by LIMS. The editor
// slot pulls every installed block advertising the `editor` capability.

// ── Slot: ELN Sidebar (dogfood #233) ────────────────────────────────────
const sidebarSlot = mod.declareSlot("sidebar", {
  accepts: "block",
  renderer: SlotSidebar,
  layout: "vertical",
  order: 2,
  defaults: {},
});

// ── Block: Metadata ─────────────────────────────────────────────────────
const metadataBlock = mod.registerBlock("metadata", {
  label: "Metadata",
  icon: Info,
  component: MetadataBlock,
  listensTo: [],
  onEvent: {},
  emits: [],
  getDisplayName: () => "Metadata",
  serialize: () => "{}",
  deserialize: () => ({}),
  defaultState: {},
});

// ── Block: Linked Entities ──────────────────────────────────────────────
const linkedEntitiesBlock = mod.registerBlock("linked-entities", {
  label: "Linked Entities",
  icon: Link,
  component: LinkedEntitiesBlock,
  listensTo: [],
  onEvent: {},
  emits: [],
  getDisplayName: () => "Linked Entities",
  serialize: () => "{}",
  deserialize: () => ({}),
  defaultState: {},
});

// ── Block: Attachments ──────────────────────────────────────────────────
const attachmentsBlock = mod.registerBlock("attachments", {
  label: "Attachments",
  icon: Paperclip,
  component: AttachmentsBlock,
  listensTo: [],
  onEvent: {},
  emits: [],
  getDisplayName: () => "Attachments",
  serialize: () => "{}",
  deserialize: () => ({}),
  defaultState: {},
});

// ── Bind sidebar blocks into sidebar slot ───────────────────────────────
mod.registerIntoSlot(sidebarSlot, metadataBlock, {}, 0);
mod.registerIntoSlot(sidebarSlot, linkedEntitiesBlock, {}, 1);
mod.registerIntoSlot(sidebarSlot, attachmentsBlock, {}, 2);

// ── Block: Activity Feed ────────────────────────────────────────────────
const activityFeedBlock = mod.registerBlock("activity-feed", {
  label: "Activity Feed",
  icon: History,
  component: ActivityFeedBlock,
  listensTo: ["eln.actions.pending", "eln.actions.flushed", "eln.entry.saved"],
  onEvent: activityFeedOnEvent,
  emits: [],
  getDisplayName: () => "Activity Feed",
  serialize: () => "{}",
  deserialize: () => ({}),
  defaultState: {},
});

// ── Bind Activity Feed into sidebar slot ────────────────────────────────
mod.registerIntoSlot(sidebarSlot, activityFeedBlock, { noCard: true }, 3);

// ── Settings: Protocol management ───────────────────────────────────────
mod.registerSettingsSection("protocol-settings", {
  label: "Protocols",
  icon: ListChecks,
  component: lazy(() => import("./settings/ProtocolSettings")),
  order: 20,
});

}
