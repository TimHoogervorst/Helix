import { lazy } from "react";
import { FlaskConical, ListChecks, Download, History, Table, MessageSquare, Database, Info, Link, Paperclip } from "lucide-react";
import {
  registerRoute,
  registerLibraryItem,
  registerBlock,
  registerSettingsSection,
  declareSlot,
  registerButton,
  registerIntoSlot,
} from "../../shell/src/mod-system";
import { ButtonGroupRenderer } from "../../shell/src/workspace/ButtonGroupRenderer";
import { SlotSidebar } from "../../shell/src/shared/components/Sidebar/SlotSidebar";
import { TipTapRenderer } from "../../shell/src/workspace/TipTapRenderer";
import ElnLibraryCard from "./library/ElnLibraryCard";
import { TableBlockComponent } from "./blocks/TableNodeView";
import { CommentBlockComponent } from "./blocks/CommentNodeView";
import { ProtocolBlockComponent } from "./blocks/ProtocolBlockNode";
import { RegistryTableBlockComponent } from "./blocks/RegistryTableNode";
import { ActivityFeedBlock } from "./components/ActivityFeedBlock";
import { MetadataBlock } from "./blocks/MetadataBlock";
import { LinkedEntitiesBlock } from "./blocks/LinkedEntitiesBlock";
import { AttachmentsBlock } from "./blocks/AttachmentsBlock";

export function register() {
  // ── Slot: Header actions toolbar (dogfood #227) ──────────────────────────
  declareSlot({
    id: "eln.header.actions",
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

  // ── Library: ELN entry card ──────────────────────────────────────────
  registerLibraryItem({
    id: "eln.entry",
    icon: FlaskConical,
    listCard: ElnLibraryCard,
    property_fields: [
      { key: "samples_count" },
      { key: "attachments_count" },
    ],
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
    id: "eln.table-block",
    label: "Table",
    icon: Table,
    component: TableBlockComponent,
    listensTo: [],
    onEvent: {},
    tags: ["data", "spreadsheet"],
    getDisplayName: (attrs) => (attrs.title as string) || "Table",
    messages: {
      created: "Table '{name}' created",
      edited: "Table '{name}' edited",
      deleted: "Table '{name}' deleted",
    },
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
    id: "eln.comment-block",
    label: "Comment",
    icon: MessageSquare,
    component: CommentBlockComponent,
    listensTo: [],
    onEvent: {},
    tags: ["discussion", "annotation"],
    getDisplayName: (attrs) => {
      const thread = attrs.thread as Array<{ authorName?: string }> | undefined;
      return thread?.[0]?.authorName || "Comment";
    },
    messages: {
      created: "Comment by '{name}' created",
      edited: "Comment by '{name}' edited",
      deleted: "Comment by '{name}' deleted",
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
    id: "eln.protocol-block",
    label: "Protocol",
    icon: FlaskConical,
    component: ProtocolBlockComponent,
    listensTo: [],
    onEvent: {},
    tags: ["procedure", "workflow"],
    getDisplayName: (attrs) => (attrs.name as string) || "Protocol",
    messages: {
      created: "Protocol '{name}' created",
      edited: "Protocol '{name}' edited",
      deleted: "Protocol '{name}' deleted",
    },
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
    id: "eln.registryTable-block",
    label: "Registry Table",
    icon: Database,
    component: RegistryTableBlockComponent,
    listensTo: [],
    onEvent: {},
    tags: ["table", "registry", "lims"],
    getDisplayName: (attrs) =>
      (attrs.schemaName || attrs.title) as string || "Registry Table",
    messages: {
      created: "Registry Table '{name}' created",
      edited: "Registry Table '{name}' edited",
      deleted: "Registry Table '{name}' deleted",
    },
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
  registerIntoSlot("eln.editor", "eln.table-block", {}, 0);
  registerIntoSlot("eln.editor", "eln.comment-block", {}, 1);
  registerIntoSlot("eln.editor", "eln.protocol-block", {}, 2);
  registerIntoSlot("eln.editor", "eln.registryTable-block", { stretch: true }, 3);

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
    id: "eln.metadata-block",
    label: "Metadata",
    icon: Info,
    component: MetadataBlock,
    listensTo: [],
    onEvent: {},
    getDisplayName: () => "Metadata",
    messages: {},
    serialize: () => "{}",
    deserialize: () => ({}),
    defaultState: {},
  });

  // ── Block: Linked Entities ─────────────────────────────────────────────
  registerBlock({
    id: "eln.linked-entities-block",
    label: "Linked Entities",
    icon: Link,
    component: LinkedEntitiesBlock,
    listensTo: [],
    onEvent: {},
    getDisplayName: () => "Linked Entities",
    messages: {},
    serialize: () => "{}",
    deserialize: () => ({}),
    defaultState: {},
  });

  // ── Block: Attachments ────────────────────────────────────────────────
  registerBlock({
    id: "eln.attachments-block",
    label: "Attachments",
    icon: Paperclip,
    component: AttachmentsBlock,
    listensTo: [],
    onEvent: {},
    getDisplayName: () => "Attachments",
    messages: {},
    serialize: () => "{}",
    deserialize: () => ({}),
    defaultState: {},
  });

  // ── Bind sidebar blocks into eln.sidebar slot ──────────────────────────
  registerIntoSlot("eln.sidebar", "eln.metadata-block", {}, 0);
  registerIntoSlot("eln.sidebar", "eln.linked-entities-block", {}, 1);
  registerIntoSlot("eln.sidebar", "eln.attachments-block", {}, 2);

  // ── Block: Activity Feed ─────────────────────────────────────────────
  registerBlock({
    id: "eln.activity-feed",
    label: "Activity Feed",
    icon: History,
    component: ActivityFeedBlock,
    listensTo: [],
    onEvent: {},
    getDisplayName: () => "Activity Feed",
    messages: {},
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
