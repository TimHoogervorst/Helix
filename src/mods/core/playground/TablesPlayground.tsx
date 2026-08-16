import { useState } from "react";
import {
  Table,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "../../../shell/src/shared/primitives/Table";
import { Button } from "../../../shell/src/shared/primitives/Button";
import { Input } from "../../../shell/src/shared/primitives/Input";

interface HarnessRow {
  id: string;
  name: string;
  role: string;
  note: string;
}

const INITIAL_ROWS: HarnessRow[] = [
  { id: "row-1", name: "Aster", role: "Researcher", note: "Warm-up row" },
  { id: "row-2", name: "Briar", role: "Reviewer", note: "Click any cell to edit" },
  { id: "row-3", name: "Cedar", role: "Operator", note: "Local mock data" },
];

const PLACEHOLDER_SECTIONS = [
  "Formula demo",
  "Layout demo",
  "Interaction bench",
  "Prototype tables",
  "Capability matrix",
] as const;

function TextHarnessCell({
  value,
  onCommit,
  testId,
}: {
  value: string;
  onCommit: (value: string) => void;
  testId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const startEditing = () => {
    setDraft(value);
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    if (draft !== value) onCommit(draft);
  };

  if (editing) {
    return (
      <Input
        autoFocus
        aria-label={`Edit ${testId}`}
        className="px-2 py-1 text-sm"
        data-testid={`${testId}-input`}
        onBlur={commit}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
        value={draft}
      />
    );
  }

  return (
    <Button
      type="button"
      className="w-full justify-start text-left text-sm"
      data-testid={testId}
      onClick={startEditing}
      variant="ghost"
    >
      {value}
    </Button>
  );
}

function HarnessTable() {
  const [rows, setRows] = useState(INITIAL_ROWS);

  const updateCell = (rowId: string, column: keyof Omit<HarnessRow, "id">, value: string) => {
    setRows((currentRows) =>
      currentRows.map((row) => (row.id === rowId ? { ...row, [column]: value } : row)),
    );
  };

  return (
    <section
      aria-labelledby="cell-gallery-heading"
      className="rounded-xl border border-[var(--color-ink-hairline)] bg-[var(--color-card)] p-5"
    >
      <div className="mb-4">
        <p className="font-[var(--font-label)] text-xs uppercase tracking-[0.18em] text-[var(--color-primary)]">
          First harness
        </p>
        <h2 id="cell-gallery-heading" className="mt-1 text-xl font-semibold text-[var(--color-ink)]">
          Cell gallery
        </h2>
        <p className="mt-1 text-sm text-[var(--color-ink-muted-foreground)]">
          Plain text cells backed by local mock rows. Click a cell, then commit with blur or Enter.
        </p>
      </div>
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>Name</TableHeaderCell>
            <TableHeaderCell>Role</TableHeaderCell>
            <TableHeaderCell>Note</TableHeaderCell>
          </TableRow>
        </TableHead>
        <tbody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              {(["name", "role", "note"] as const).map((column) => (
            <TableCell key={column} className="p-0">
                  <TextHarnessCell
                    value={row[column]}
                    onCommit={(value) => updateCell(row.id, column, value)}
                    testId={`cell-${row.id}-${column}`}
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </tbody>
      </Table>
    </section>
  );
}

function PlaceholderSection({ title }: { title: string }) {
  const headingId = `${title.toLowerCase().replaceAll(" ", "-")}-heading`;

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-xl border border-dashed border-[var(--color-ink-hairline)] bg-[var(--color-card)] px-5 py-6"
    >
      <h2
        id={headingId}
        className="font-[var(--font-label)] text-lg font-semibold text-[var(--color-ink)]"
      >
        {title}
      </h2>
      <p className="mt-1 text-sm text-[var(--color-ink-muted-foreground)]">
        Placeholder for the next Table Kit experiment.
      </p>
    </section>
  );
}

function TablesPlayground() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8" data-testid="tables-playground">
      <header className="border-b border-[var(--color-ink-hairline)] pb-6">
        <p className="font-[var(--font-label)] text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">
          Development playground
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--color-ink)]">
          Table Kit laboratory
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--color-ink-muted-foreground)]">
          A local sandbox for exploring typed cells, formulas, and table interactions before they become shared product surfaces.
        </p>
      </header>

      <HarnessTable />

      {PLACEHOLDER_SECTIONS.map((title) => (
        <PlaceholderSection key={title} title={title} />
      ))}
    </main>
  );
}

export default TablesPlayground;
