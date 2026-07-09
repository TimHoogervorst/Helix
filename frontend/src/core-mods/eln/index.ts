import { lazy } from "react";
import { FlaskConical } from "lucide-react";
import {
  registerRoute,
  registerLibraryItem,
  registerWorkspace,
  registerBlock,
  ModRegistry,
  BLOCK_TYPE_TIPTAP_NODE,
} from "../../core/mod-system";
import ElnLibraryCard from "./library/ElnLibraryCard";
import LimsTable from "./blocks/LimsTable";

export const meta = {
  id: "eln",
  displayName: "ELN",
  dependsOn: ["lims", "tags"] as string[],
};

export function register() {
  // ── Workspace: ELN notebook workspace ───────────────────────────────────
  registerWorkspace({ id: "eln", displayName: "ELN" });

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

  // ── Block: LIMS table ─────────────────────────────────────────────────
  registerBlock({
    id: "eln.table",
    label: "Table",
    description: "Insert a schema-backed LIMS table",
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
}
