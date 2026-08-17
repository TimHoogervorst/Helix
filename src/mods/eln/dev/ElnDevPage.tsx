import { useMemo, useRef } from "react";
import type { BlockBinding } from "../../../shell/src/mod-system/types";
import { ModRegistry } from "../../../shell/src/mod-system/ModRegistry";
import { TipTapRenderer } from "../../../shell/src/workspace/TipTapRenderer";
import { WorkspaceBus } from "../../../shell/src/workspace/WorkspaceBus";
import { elnExtensions } from "../editor/extensions/elnExtensions";

const previewContent = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Registration table" }],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "Edit names and cell values below to explore how a schema-driven table responds to changes. Registration is intentionally disabled in this prototype." }],
    },
    {
      type: "eln.registry-table",
      attrs: {
        content: JSON.stringify({
          schemaId: 1,
          schemaName: "Sample",
          schemaContentHash: "preview",
          title: "Registration table",
          columns: [
            { id: "amount", name: "Amount", type: "number" },
            { id: "status", name: "Status", type: "text" },
            { id: "date", name: "Date", type: "date" },
            { id: "active", name: "Active", type: "boolean" },
            { id: "role", name: "Role", type: "dropdown", dropdownId: 1 },
            { id: "source", name: "Source", type: "entity-picker", referenceSchemaId: 1 },
          ],
          rows: [
            {
              entityId: null,
              displayId: "#preview-1",
              __name: "Sample A",
              values: { Amount: 12, Status: "Ready", Date: "2026-08-16", Active: true, Role: "Researcher", Source: "ENT-001" },
              isRegistered: false,
              lastRegisteredValueHash: null,
              registrationError: null,
            },
            {
              entityId: null,
              displayId: "#preview-2",
              __name: "Sample B",
              values: { Amount: 24, Status: "Pending", Date: "2026-08-17", Active: false, Role: "Reviewer", Source: "ENT-002" },
              isRegistered: false,
              lastRegisteredValueHash: null,
              registrationError: null,
            },
          ],
        }),
      },
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "Normal table" }],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "This table is a free-form block. Rename columns, edit cells, add rows, and try the table controls." }],
    },
    {
      type: "eln.table",
      attrs: {
        content: JSON.stringify({
          title: "Normal table",
          columns: [
            { id: "material", name: "Material", type: "text" },
            { id: "quantity", name: "Quantity", type: "number" },
            { id: "when", name: "When", type: "date" },
            { id: "ready", name: "Ready", type: "boolean" },
            { id: "role", name: "Role", type: "dropdown" },
            { id: "source", name: "Source", type: "entity-picker" },
          ],
          rows: [
            { id: "row-1", cells: { material: "Buffer", quantity: 10, when: "2026-08-16", ready: true, role: "Researcher", source: "ENT-001" } },
            { id: "row-2", cells: { material: "Reagent", quantity: 2, when: "2026-08-17", ready: false, role: "Reviewer", source: "ENT-002" } },
          ],
        }),
      },
    },
  ],
};

export default function ElnDevPage() {
  const busRef = useRef<WorkspaceBus>(null);
  if (!busRef.current) busRef.current = new WorkspaceBus();

  const bindings = useMemo(() => {
    const resolved = ModRegistry.getInstance().resolveSlot("eln.editor");
    return resolved?.bindings.filter(
      (binding): binding is BlockBinding => binding.type === "block",
    ) ?? [];
  }, []);

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6" data-testid="eln-dev-page">
      <header>
        <p className="text-eyebrow">Development preview</p>
        <h1 className="text-title">ELN table blocks</h1>
        <p className="text-meta mt-1">
          Static Tiptap rendering of the registration and normal table blocks.
        </p>
      </header>
      <TipTapRenderer
        slotId="eln.editor"
        bindings={bindings}
        bus={busRef.current}
        context={{ workspaceId: "eln", user: null, viewMode: "prototype", entryId: "dev" }}
        content={previewContent}
        extensions={elnExtensions}
        editable
      />
    </main>
  );
}
