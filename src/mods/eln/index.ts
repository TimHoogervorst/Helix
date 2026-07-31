import { lazy } from "react";
import { FlaskConical, ListChecks, Download, History, Table, MessageSquare, Database, Info, Link, Paperclip } from "lucide-react";
import {
  registerRoute,
  registerBlock,
  registerSettingsSection,
  declareSlot,
  registerButton,
  registerIntoSlot,
} from "../../shell/src/mod-system";
import { ButtonGroupRenderer } from "../../shell/src/workspace/ButtonGroupRenderer";
import { SlotSidebar } from "../../shell/src/shared/components/Sidebar/SlotSidebar";
import { TipTapRenderer } from "../../shell/src/workspace/TipTapRenderer";
import { TableBlockComponent } from "./blocks/TableNodeView";
import { CommentBlockComponent } from "./blocks/CommentNodeView";
import { ProtocolBlockComponent } from "./blocks/ProtocolBlockNode";
import { RegistryTableBlockComponent } from "./blocks/RegistryTableNode";
import { ActivityFeedBlock, activityFeedOnEvent } from "./components/ActivityFeedBlock";
import { MetadataBlock } from "./blocks/MetadataBlock";
import { LinkedEntitiesBlock } from "./blocks/LinkedEntitiesBlock";
import { AttachmentsBlock } from "./blocks/AttachmentsBlock";

export function register() {
  // ── Slot: Header actions toolbar (dogfood #227) ──────────────────────────
  declareSlot({
    id: "eln.header-actions",
    accepts: "button",
    renderer: ButtonGroupRenderer,
    layout: "horizontal",
    order: 0,
    defaults: {},
  });

  // ── Standalone route: entry detail page (full workspace) ──────────────
  registerRoute({
    id: "eln.entry-page",
    modId: "eln",
    path: "/eln/:id",
    component: lazy(() => import("./workspace/ElnWorkspacePage")),
  });

  // ── Slot: ELN Editor ────────────────────────────────────
  declareSlot({
    id: "eln.editor",
    accepts: "block",
    renderer: TipTapRenderer,
    layout: "vertical",
    order: 0,
    defaults: {},
  });

  // ── Block: Table (new shape, slot-ready) ─────────────────────────────
  registerBlock({
    id: "eln.table",
    label: "Table",
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

  // ── Block: Comment (new shape, slot-ready) ──────────────────────────
  registerBlock({
    id: "eln.comment",
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

  // ── Block: Protocol (new shape, slot-ready) ─────────────────────────
  registerBlock({
    id: "eln.protocol",
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

  // ── Block: Registry Table ────────────────────────────────────────────
  registerBlock({
    id: "eln.registry-table",
    label: "Registry Table",
    icon: Database,
    component: RegistryTableBlockComponent,
    listensTo: [],
    onEvent: {},
    emits: [
      { id: "row-added", label: "Row Added", core: "created" },
      { id: "registered-entities", label: "Entities Registered", core: "created" },
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

  // ── Bind blocks into eln.editor slot ──────────────────────────────────
  registerIntoSlot("eln.editor", "eln.table", {}, 0);
  registerIntoSlot("eln.editor", "eln.comment", {}, 1);
  registerIntoSlot("eln.editor", "eln.protocol", {}, 2);
  registerIntoSlot("eln.editor", "eln.registry-table", { stretch: true }, 3);

  // ── Slot: ELN Sidebar (dogfood #233) ──────────────────────────────────
  declareSlot({
    id: "eln.sidebar",
    accepts: "block",
    renderer: SlotSidebar,
    layout: "vertical",
    order: 2,
    defaults: {},
  });

  // ── Block: Metadata ──────────────────────────────────────────────────
  registerBlock({
    id: "eln.metadata",
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

  // ── Block: Linked Entities ─────────────────────────────────────────────
  registerBlock({
    id: "eln.linked-entities",
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

  // ── Block: Attachments ────────────────────────────────────────────────
  registerBlock({
    id: "eln.attachments",
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

  // ── Bind sidebar blocks into eln.sidebar slot ──────────────────────────
  registerIntoSlot("eln.sidebar", "eln.metadata", {}, 0);
  registerIntoSlot("eln.sidebar", "eln.linked-entities", {}, 1);
  registerIntoSlot("eln.sidebar", "eln.attachments", {}, 2);

  // ── Block: Activity Feed ─────────────────────────────────────────────
  registerBlock({
    id: "eln.activity-feed",
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

  // ── Bind Activity Feed into sidebar slot ──────────────────────────────
  registerIntoSlot("eln.sidebar", "eln.activity-feed", { noCard: true }, 3);

  // ── Settings: Protocol management ────────────────────────────────────
  registerSettingsSection({
    id: "eln.protocol-settings",
    modId: "eln",
    label: "Protocols",
    icon: ListChecks,
    component: lazy(() => import("./settings/ProtocolSettings")),
    order: 20,
  });

}
