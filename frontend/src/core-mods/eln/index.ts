import { lazy } from "react";
import { FlaskConical, ListChecks, Download } from "lucide-react";
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
import ElnLibraryCard from "./library/ElnLibraryCard";
import LimsTable from "./blocks/LimsTable";
import CommentBlock from "./blocks/CommentBlock";
import TableBlock from "./blocks/TableBlock";
import ProtocolBlock from "./blocks/ProtocolBlock";

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
