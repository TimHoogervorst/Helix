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
      content: [{ type: "text", text: "ELN table block preview" }],
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
          ],
          rows: [
            {
              entityId: null,
              displayId: "#preview-1",
              __name: "Sample A",
              values: { Amount: 12, Status: "Ready" },
              isRegistered: false,
              lastRegisteredValueHash: null,
              registrationError: null,
            },
            {
              entityId: null,
              displayId: "#preview-2",
              __name: "Sample B",
              values: { Amount: 24, Status: "Pending" },
              isRegistered: false,
              lastRegisteredValueHash: null,
              registrationError: null,
            },
          ],
        }),
      },
    },
    {
      type: "eln.table",
      attrs: {
        content: JSON.stringify({
          title: "Normal table",
          columns: [
            { id: "material", name: "Material" },
            { id: "quantity", name: "Quantity" },
          ],
          rows: [
            { id: "row-1", cells: { material: "Buffer", quantity: "10 mL" } },
            { id: "row-2", cells: { material: "Reagent", quantity: "2 g" } },
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
        context={{ workspaceId: "eln", user: null, viewMode: "preview", entryId: "dev" }}
        content={previewContent}
        extensions={elnExtensions}
        editable={false}
      />
    </main>
  );
}
