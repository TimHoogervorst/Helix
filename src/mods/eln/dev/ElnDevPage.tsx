import { useMemo, useRef } from "react";
import type { BlockBinding } from "../../../shell/src/mod-system/types";
import {
  Table,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "../../../shell/src/shared/primitives/Table";
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

type TableCapability = {
  id: string;
  label: string;
  currentOwner: string;
  targetOwner: string;
  consumers: string[];
  testSeam: string;
  migration: string;
  coverage: {
    registry: string;
    plain: string;
    kit: string;
    result: string;
  };
};

/** Single source for the /dev/eln capability matrix and extraction inventory. */
export const TABLE_KIT_CAPABILITIES: readonly TableCapability[] = [
  { id: "text", label: "Text cells", currentOwner: "Shared ELN cell components", targetOwner: "Table Kit", consumers: ["Registry", "Plain", "Result"], testSeam: "Cell interaction tests", migration: "Kit extraction", coverage: { registry: "Yes", plain: "Yes", kit: "Target", result: "Target" } },
  { id: "number", label: "Number cells", currentOwner: "Shared ELN cell components", targetOwner: "Table Kit", consumers: ["Registry", "Plain", "Result"], testSeam: "Cell interaction tests", migration: "Kit extraction", coverage: { registry: "Yes", plain: "Yes", kit: "Target", result: "Target" } },
  { id: "date", label: "Date cells", currentOwner: "Shared ELN cell components", targetOwner: "Table Kit", consumers: ["Registry", "Plain", "Result"], testSeam: "Cell interaction tests", migration: "Kit extraction", coverage: { registry: "Yes", plain: "Yes", kit: "Target", result: "Target" } },
  { id: "boolean", label: "Boolean cells", currentOwner: "Shared ELN cell components", targetOwner: "Table Kit", consumers: ["Registry", "Plain", "Result"], testSeam: "Cell interaction tests", migration: "Kit extraction", coverage: { registry: "Yes", plain: "Yes", kit: "Target", result: "Target" } },
  { id: "dropdown", label: "Dropdown cells", currentOwner: "Shared ELN cell components", targetOwner: "Table Kit", consumers: ["Registry", "Plain", "Result"], testSeam: "Cell interaction tests", migration: "Kit extraction", coverage: { registry: "Yes", plain: "Yes", kit: "Target", result: "Target" } },
  { id: "entity-picker", label: "Entity-picker cells", currentOwner: "Shared ELN cell components", targetOwner: "Table Kit", consumers: ["Registry", "Plain", "Result"], testSeam: "Cell interaction tests", migration: "Kit extraction", coverage: { registry: "Yes", plain: "Yes", kit: "Target", result: "Target" } },
  { id: "full-cell-editing", label: "Full-cell editing and validation errors", currentOwner: "Table node views", targetOwner: "Table Kit", consumers: ["Registry", "Plain", "Result"], testSeam: "Cell interaction tests", migration: "Kit extraction", coverage: { registry: "Yes", plain: "Yes", kit: "Target", result: "Target" } },
  { id: "keyboard", label: "Arrow, Tab/Shift-Tab, Enter, and Escape", currentOwner: "useTableInteraction", targetOwner: "Table Kit", consumers: ["Registry", "Plain", "Result"], testSeam: "Interaction hook tests", migration: "Kit extraction", coverage: { registry: "Yes", plain: "Yes", kit: "Target", result: "Target" } },
  { id: "selection", label: "Multi-cell selection (active cell and range)", currentOwner: "useTableInteraction", targetOwner: "Table Kit", consumers: ["Registry", "Plain", "Result"], testSeam: "Selection tests", migration: "Kit extraction", coverage: { registry: "Yes", plain: "Yes", kit: "Target", result: "Target" } },
  { id: "clipboard", label: "TSV copy/paste", currentOwner: "useTableInteraction", targetOwner: "Table Kit", consumers: ["Registry", "Plain", "Result"], testSeam: "TipTap clipboard tests", migration: "Kit extraction", coverage: { registry: "Yes", plain: "Yes", kit: "Target", result: "Target" } },
  { id: "event-isolation", label: "TipTap/ProseMirror event isolation", currentOwner: "Table node views", targetOwner: "Table Kit", consumers: ["Registry", "Plain", "Result"], testSeam: "TipTap node-view tests", migration: "Kit extraction", coverage: { registry: "Yes", plain: "Yes", kit: "Target", result: "Target" } },
  { id: "tracks", label: "Explicit column tracks", currentOwner: "Table layout primitives", targetOwner: "Table Kit", consumers: ["Registry", "Plain", "Result"], testSeam: "Table layout tests", migration: "Kit extraction", coverage: { registry: "Yes", plain: "Yes", kit: "Target", result: "Target" } },
  { id: "stretch", label: "Stretch and horizontal overflow", currentOwner: "Table layout primitives", targetOwner: "Table Kit", consumers: ["Registry", "Plain", "Result"], testSeam: "Table layout tests", migration: "Kit extraction", coverage: { registry: "Yes", plain: "Yes", kit: "Target", result: "Target" } },
  { id: "surface", label: "Opaque surfaces and hover-only scrollbars", currentOwner: "Table layout primitives", targetOwner: "Table Kit", consumers: ["Registry", "Plain", "Result"], testSeam: "/dev/eln visual sign-off", migration: "Kit extraction", coverage: { registry: "Yes", plain: "Yes", kit: "Target", result: "Target" } },
  { id: "schema-picker", label: "Schema picker", currentOwner: "Registry Table", targetOwner: "Owning table block", consumers: ["Registry"], testSeam: "Registry component tests", migration: "Registry migration", coverage: { registry: "Domain", plain: "N/A", kit: "N/A", result: "N/A" } },
  { id: "registration", label: "Registration and status indicators", currentOwner: "Registry Table", targetOwner: "Owning table block", consumers: ["Registry", "Result"], testSeam: "Registration component/API tests", migration: "Registry migration, then Result", coverage: { registry: "Domain", plain: "N/A", kit: "N/A", result: "Domain" } },
  { id: "entity-column", label: "Entity Column constraints and lock-after-registration", currentOwner: "Not built", targetOwner: "Result Table", consumers: ["Result"], testSeam: "Result component/backend tests", migration: "Result construction", coverage: { registry: "N/A", plain: "N/A", kit: "N/A", result: "Domain" } },
];

export function CapabilityMatrix() {
  return (
    <section
      aria-labelledby="capability-matrix-heading"
      className="rounded-xl border border-[var(--color-ink-hairline)] bg-[var(--color-card)] p-5"
      data-testid="table-kit-capability-matrix"
    >
      <p className="text-eyebrow">Coverage</p>
      <h2 id="capability-matrix-heading" className="mt-1 text-xl font-semibold text-[var(--color-ink)]">
        Table Kit capability matrix
      </h2>
      <p className="text-meta mt-1">Generated from the shared capability registry. “Target” marks planned shared support.</p>
      <div className="mt-4 overflow-x-auto">
        <Table className="min-w-[1400px]">
          <TableHead>
            <TableRow>
              {[
                "Capability",
                "Current owner",
                "Target owner",
                "Consumers",
                "Registry Table",
                "Plain Table",
                "Shared Table Kit",
                "Future Result Table",
                "Test seam",
                "Migration",
              ].map((heading) => (
                <TableHeaderCell key={heading}>{heading}</TableHeaderCell>
              ))}
            </TableRow>
          </TableHead>
          <tbody>
            {TABLE_KIT_CAPABILITIES.map((capability) => (
              <TableRow key={capability.id}>
                <TableHeaderCell>{capability.label}</TableHeaderCell>
                <TableCell>{capability.currentOwner}</TableCell>
                <TableCell>{capability.targetOwner}</TableCell>
                <TableCell>{capability.consumers.join(", ")}</TableCell>
                <TableCell>{capability.coverage.registry}</TableCell>
                <TableCell>{capability.coverage.plain}</TableCell>
                <TableCell>{capability.coverage.kit}</TableCell>
                <TableCell>{capability.coverage.result}</TableCell>
                <TableCell>{capability.testSeam}</TableCell>
                <TableCell>{capability.migration}</TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
      </div>
    </section>
  );
}

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
      <CapabilityMatrix />
    </main>
  );
}
