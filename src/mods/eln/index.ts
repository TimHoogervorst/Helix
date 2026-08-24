import { lazy } from "react";
import { FlaskConical, ListChecks, History, Table, MessageSquare, Database, Info, Link, Paperclip } from "lucide-react";
import { Mod } from "../../shell/src/mod-system/Mod";
import { BlockEvent } from "../../shell/src/mod-system/BlockEvent";
import type { ModManifest } from "../../shell/src/mod-system/types";
import { ButtonGroupRenderer } from "../../shell/src/workspace/ButtonGroupRenderer";
import { SlotSidebar } from "../../shell/src/shared/components/Sidebar/SlotSidebar";
import { TipTapRenderer } from "../../shell/src/workspace/TipTapRenderer";
import { TableBlockComponent } from "./blocks/TableNodeView";
import { CommentBlockComponent } from "./blocks/CommentNodeView";
import { ProtocolBlockComponent } from "./blocks/ProtocolBlockNode";
import { RegistryTableBlockComponent } from "./blocks/RegistryTableNode";
import { ResultTableBlockComponent } from "./blocks/ResultTableNode";
import { ActivityFeedBlock, activityFeedOnEvent } from "./components/ActivityFeedBlock";
import { MetadataBlock } from "./blocks/MetadataBlock";
import { LinkedEntitiesBlock } from "./blocks/LinkedEntitiesBlock";
import { AttachmentsBlock } from "./blocks/AttachmentsBlock";
import manifest from "./modManifest.json";

const mod = new Mod(manifest as ModManifest);

// ── Slot: Header actions toolbar (dogfood #227) ──────────────────────────
mod.declareSlot("header-actions", {
  accepts: "button",
  renderer: ButtonGroupRenderer,
  layout: "horizontal",
  order: 0,
  defaults: {},
});

// ── Standalone route: entry detail page (full workspace) ──────────────
mod.registerRoute("entry-page", {
  path: "/eln/:id",
  component: lazy(() => import("./workspace/ElnWorkspacePage")),
});

// ── Slot: ELN Editor ────────────────────────────────────
export const editorSlot = mod.declareSlot("editor", {
  accepts: "block",
  renderer: TipTapRenderer,
  layout: "vertical",
  order: 0,
  defaults: {},
});

// ── Block: Table ───────────────────────────────────────────────────────
export const tableBlock = mod.registerBlock("table", {
  label: "Table",
  layout: "dynamic-bleed",
  icon: Table,
  component: TableBlockComponent,
  listensTo: [],
  onEvent: {},
  emits: [],
  tags: ["data", "spreadsheet"],
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

// ── Block: Comment ─────────────────────────────────────────────────────
export const commentBlock = mod.registerBlock("comment", {
  label: "Comment",
  icon: MessageSquare,
  component: CommentBlockComponent,
  listensTo: [],
  onEvent: {},
  emits: [],
  tags: ["discussion", "annotation"],
  getDisplayName: (attrs) => {
    const thread = attrs.thread as Array<{ authorName?: string }> | undefined;
    return thread?.[0]?.authorName || "Comment";
  },
  serialize: (state) => JSON.stringify(state),
  deserialize: (json) => {
    try { return JSON.parse(json); } catch { return {}; }
  },
  defaultState: {
    resolved: false,
    thread: [],
  },
});

// ── Block: Protocol ────────────────────────────────────────────────────
export const protocolBlock = mod.registerBlock("protocol", {
  label: "Protocol",
  icon: FlaskConical,
  component: ProtocolBlockComponent,
  listensTo: [],
  onEvent: {},
  emits: [],
  tags: ["procedure", "workflow"],
  getDisplayName: (attrs) => (attrs.name as string) || "Protocol",
  serialize: (state) => JSON.stringify(state),
  deserialize: (json) => {
    try { return JSON.parse(json); } catch { return {}; }
  },
  defaultState: {
    protocolId: null,
    name: "Protocol",
    items: [],
    stepStates: {},
    editable: false,
  },
});

// ── Block: Registry Table ──────────────────────────────────────────────
export const registryTableBlock = mod.registerBlock("registry-table", {
  label: "Registry Table",
  layout: "dynamic-bleed",
  icon: Database,
  component: RegistryTableBlockComponent,
  listensTo: [],
  onEvent: {},
  emits: [
    BlockEvent.action({ id: "entities-registered", core: "edited" }),
    BlockEvent.action({ id: "row-added", core: "edited" }),
    BlockEvent.ui({ id: "column-resized" }),
  ],
  tags: ["table", "registry", "lims"],
  getDisplayName: (attrs) =>
    (attrs.schemaName || attrs.title) as string || "Registry Table",
  serialize: (state) => JSON.stringify(state),
  deserialize: (json) => {
    try { return JSON.parse(json); } catch { return {}; }
  },
  defaultState: {
    schemaId: null,
    schemaName: null,
    schemaContentHash: null,
    title: "Registry Table",
    columns: [],
    rows: [],
  },
});

// ── Block: Result Table ───────────────────────────────────────────────────
export const resultTableBlock = mod.registerBlock("result-table", {
  label: "Result Table",
  layout: "full-bleed",
  icon: Database,
  component: ResultTableBlockComponent,
  listensTo: [],
  onEvent: {},
  emits: [BlockEvent.action({ id: "results-registered", core: "edited" })],
  tags: ["table", "result", "lims"],
  getDisplayName: (attrs) => (attrs.schemaName || attrs.title) as string || "Result Table",
  serialize: (state) => JSON.stringify(state),
  deserialize: (json) => {
    try { return JSON.parse(json); } catch { return {}; }
  },
  defaultState: {
    schemaId: null,
    schemaName: null,
    schemaContentHash: null,
    title: "Result Table",
    columns: [],
    rows: [],
  },
});

// ── Bind blocks into editor slot ────────────────────────────────────────
mod.registerIntoSlot(editorSlot, tableBlock, {}, 0);
mod.registerIntoSlot(editorSlot, commentBlock, {}, 1);
mod.registerIntoSlot(editorSlot, protocolBlock, {}, 2);
mod.registerIntoSlot(editorSlot, registryTableBlock, {}, 3);
mod.registerIntoSlot(editorSlot, resultTableBlock, {}, 4);

// ── Slot: ELN Sidebar (dogfood #233) ────────────────────────────────────
export const sidebarSlot = mod.declareSlot("sidebar", {
  accepts: "block",
  renderer: SlotSidebar,
  layout: "vertical",
  order: 2,
  defaults: {},
});

// ── Block: Metadata ─────────────────────────────────────────────────────
export const metadataBlock = mod.registerBlock("metadata", {
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
export const linkedEntitiesBlock = mod.registerBlock("linked-entities", {
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
export const attachmentsBlock = mod.registerBlock("attachments", {
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
export const activityFeedBlock = mod.registerBlock("activity-feed", {
  label: "Activity Feed",
  icon: History,
  component: ActivityFeedBlock,
  listensTo: ["eln.action.performed", "eln.entry.saved"],
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

/** No-op — all registrations happen at module scope via the Mod class. */
export function register() {}
