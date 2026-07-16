import { lazy } from "react";
import { FlaskConical, ListChecks, Download, History, Table, Table2, MessageSquare } from "lucide-react";
import {
  registerRoute,
  registerLibraryItem,
  registerWorkspace,
  registerBlock,
  registerSettingsSection,
  declareSlot,
  registerButton,
  registerIntoSlot,
  ModRegistry,
  BLOCK_TYPE_TIPTAP_NODE,
} from "../../core/mod-system";
import { ButtonGroupRenderer } from "../../core/workspace/ButtonGroupRenderer";
import { PanelRenderer } from "../../core/workspace/PanelRenderer";
import { TipTapRenderer } from "../../core/workspace/TipTapRenderer";
import ElnLibraryCard from "./library/ElnLibraryCard";
import LimsTable from "./blocks/LimsTable";
import CommentBlock from "./blocks/CommentBlock";
import TableBlock from "./blocks/TableBlock";
import ProtocolBlock from "./blocks/ProtocolBlock";
import { TableBlockComponent } from "./blocks/TableNodeView";
import { LimsTableBlockComponent } from "./blocks/LimsTableNode";
import { CommentBlockComponent } from "./blocks/CommentNodeView";
import { ProtocolBlockComponent } from "./blocks/ProtocolBlockNode";
import { ActivityFeedBlock } from "./components/ActivityFeedBlock";

export const meta = {
  id: "eln",
  displayName: "ELN",
  dependsOn: ["lims", "tags"] as string[],
};

export function register() {
  // ── Workspace: ELN notebook workspace ───────────────────────────────────
  registerWorkspace({ id: "eln", displayName: "ELN" });

  // ── Slot: Header actions toolbar (dogfood #227) ──────────────────────────
  declareSlot({
    id: "eln.header.actions",
    accepts: "button",
    renderer: ButtonGroupRenderer,
    layout: "horizontal",
    order: 0,
    defaults: {},
  });

  // ── Button: Export ───────────────────────────────────────────────────────
  registerButton({
    id: "eln.export",
    label: "Export",
    icon: Download,
    onClick: ({ bus }) => {
      bus.collect("data.export");
    },
  });

  // ── Bind Export button into header actions slot ─────────────────────────
  registerIntoSlot("eln.header.actions", "eln.export", {}, 0);

  // ── Entity type: register ELN entries with the LIMS registry ────────────
  // Depends on "lims" to ensure lims.registerEntityType service is available.
  ModRegistry.getInstance()
    .call("lims.registerEntityType", {
      prefix: "E",
      entityType: "eln_entry",
      workspaceId: "eln",
      displayName: "Entry",
    })
    .catch((err: Error) => {
      console.warn(
        `[eln] Failed to register entity type with LIMS: ${err.message}`,
      );
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

  // ── Block: Legacy LIMS table ─────────────────────────────────────────
  registerBlock({
    id: "eln.legacyTable",
    label: "Legacy Table",
    description: "Insert a legacy schema-backed LIMS table",
    icon: "📊",
    type: BLOCK_TYPE_TIPTAP_NODE,
    payload: {
      node: LimsTable,
      defaultAttrs: {
        schemaId: null,
        title: "Table",
        columns: [
          { name: "Column 1", type: "Text" },
          { name: "Column 2", type: "Text" },
        ],
        rows: [
          {
            entityId: null,
            displayId: "#1",
            values: { "Column 1": "", "Column 2": "" },
          },
          {
            entityId: null,
            displayId: "#2",
            values: { "Column 1": "", "Column 2": "" },
          },
        ],
      },
    },
  });

  // ── Block: Generic Table ────────────────────────────────────────────
  registerBlock({
    id: "eln.table",
    label: "Table",
    description: "Insert a simple editable data table",
    icon: "📋",
    type: BLOCK_TYPE_TIPTAP_NODE,
    payload: {
      node: TableBlock,
      defaultAttrs: {
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
    },
  });

  // ── Block: Comment ──────────────────────────────────────────────────
  registerBlock({
    id: "eln.comment",
    label: "Comment",
    description: "Insert a threaded comment",
    icon: "💬",
    type: BLOCK_TYPE_TIPTAP_NODE,
    payload: {
      node: CommentBlock,
      defaultAttrs: {
        resolved: false,
        thread: [],
      },
    },
  });

  // ── Block: Protocol ─────────────────────────────────────────────────
  registerBlock({
    id: "eln.protocol",
    label: "Protocol",
    description: "Insert a reusable protocol",
    icon: "🧪",
    type: BLOCK_TYPE_TIPTAP_NODE,
    payload: {
      node: ProtocolBlock,
      defaultAttrs: {
        protocolId: null,
        name: "Protocol",
        items: [],
        stepStates: {},
        editable: false,
      },
    },
  });

  // ── Slot: ELN Editor (dogfood #231) ────────────────────────────────────
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

  // ── Block: Legacy LIMS Table (new shape, slot-ready) ────────────────
  registerBlock({
    id: "eln.legacyTable-block",
    label: "Legacy Table",
    icon: Table2,
    component: LimsTableBlockComponent,
    listensTo: [],
    onEvent: {},
    getDisplayName: (attrs) => ((attrs.schemaName || attrs.title) as string) || "Table",
    messages: {
      created: "Legacy Table '{name}' created",
      edited: "Legacy Table '{name}' edited",
      deleted: "Legacy Table '{name}' deleted",
    },
    serialize: (state) => JSON.stringify(state),
    deserialize: (json) => {
      try { return JSON.parse(json); } catch { return {}; }
    },
    defaultState: {
      schemaId: null,
      title: "Table",
      columns: [
        { name: "Column 1", type: "Text" },
        { name: "Column 2", type: "Text" },
      ],
      rows: [
        {
          entityId: null,
          displayId: "#1",
          values: { "Column 1": "", "Column 2": "" },
        },
        {
          entityId: null,
          displayId: "#2",
          values: { "Column 1": "", "Column 2": "" },
        },
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

  // ── Bind blocks into eln.editor slot ──────────────────────────────────
  registerIntoSlot("eln.editor", "eln.table-block", {}, 0);
  registerIntoSlot("eln.editor", "eln.legacyTable-block", {}, 1);
  registerIntoSlot("eln.editor", "eln.comment-block", {}, 2);
  registerIntoSlot("eln.editor", "eln.protocol-block", {}, 3);

  // ── Slot: ELN Sidebar (dogfood #233) ──────────────────────────────────
  declareSlot({
    id: "eln.sidebar",
    accepts: "block",
    renderer: PanelRenderer,
    layout: "vertical",
    order: 2,
    defaults: {},
  });

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
  registerIntoSlot("eln.sidebar", "eln.activity-feed", {}, 0);

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
