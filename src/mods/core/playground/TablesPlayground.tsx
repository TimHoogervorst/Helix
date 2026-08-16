import { useRef, useState, type ReactNode } from "react";
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

type CellValue = string | number | boolean | null;
type CellState = "display" | "editing" | "error" | "read-only";

interface CellBehavior {
  label: string;
  initialValue: CellValue;
  editor: "text" | "number" | "date" | "checkbox" | "select";
  options?: string[];
  render: (value: CellValue) => string;
  commit: (raw: string) => CellValue;
}

const TEXT_BEHAVIOR: CellBehavior = {
  label: "Text",
  initialValue: "Aster",
  editor: "text",
  render: (value) => String(value ?? ""),
  commit: (raw) => raw,
};

/** The playground's mock implementation of the backend operand_shape contract. */
export const CELL_REGISTRY: Record<string, CellBehavior> = {
  text: TEXT_BEHAVIOR,
  number: {
    label: "Number",
    initialValue: 42,
    editor: "number",
    render: (value) => String(value ?? ""),
    commit: (raw) => {
      const value = Number(raw);
      if (raw.trim() === "" || Number.isNaN(value)) throw new Error("Enter a number");
      return value;
    },
  },
  date: {
    label: "Date",
    initialValue: "2026-08-16",
    editor: "date",
    render: (value) => String(value ?? ""),
    commit: (raw) => {
      const [year, month, day] = raw.split("-").map(Number);
      const date = new Date(Date.UTC(year, month - 1, day));
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(raw) ||
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
      ) throw new Error("Enter a date");
      return raw;
    },
  },
  boolean: {
    label: "Boolean",
    initialValue: true,
    editor: "checkbox",
    render: (value) => (value ? "True" : "False"),
    commit: (raw) => raw === "true",
  },
  dropdown: {
    label: "Dropdown",
    initialValue: "Researcher",
    editor: "select",
    options: ["Researcher", "Reviewer", "Operator"],
    render: (value) => String(value ?? ""),
    commit: (raw) => raw,
  },
  "entity-picker": {
    label: "Reference",
    initialValue: "ENT-001",
    editor: "text",
    render: (value) => String(value ?? ""),
    commit: (raw) => raw,
  },
};

export function getCellBehavior(operandShape: string): CellBehavior {
  return CELL_REGISTRY[operandShape] ?? TEXT_BEHAVIOR;
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
          } else if (event.key === "Escape") {
            setEditing(false);
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

function GalleryCell({
  operandShape,
  state,
  testId,
  onTypedCommit,
}: {
  operandShape: string;
  state: CellState;
  testId: string;
  onTypedCommit: (value: CellValue) => void;
}) {
  const behavior = getCellBehavior(operandShape);
  const [value, setValue] = useState(behavior.initialValue);
  const [draft, setDraft] = useState(behavior.render(behavior.initialValue));
  const [editing, setEditing] = useState(state === "editing");
  const [error, setError] = useState(state === "error");
  const cancelled = useRef(false);

  const startEditing = () => {
    if (state === "read-only") return;
    setDraft(behavior.render(value));
    setError(false);
    setEditing(true);
  };

  const commit = () => {
    try {
      if (cancelled.current) {
        cancelled.current = false;
        return;
      }
      const next = behavior.commit(draft);
      setValue(next);
      setEditing(false);
      setError(false);
      onTypedCommit(next);
    } catch {
      setError(true);
    }
  };

  const editor = (): ReactNode => {
    const inputProps = {
      autoFocus: true,
      "data-testid": `${testId}-input`,
      onBlur: commit,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setDraft(
          event.currentTarget instanceof HTMLInputElement &&
            event.currentTarget.type === "checkbox"
            ? String(event.currentTarget.checked)
            : event.currentTarget.value,
        ),
      onKeyDown: (event: React.KeyboardEvent) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        } else if (event.key === "Escape") {
          cancelled.current = true;
          setEditing(false);
          setError(false);
        }
      },
    };

    if (behavior.editor === "checkbox") {
      return <input {...inputProps} className="accent-[var(--color-primary)]" type="checkbox" checked={draft === "true"} />;
    }
    if (behavior.editor === "select") {
      return (
        <select {...inputProps} className="border border-[var(--color-ink-border)] bg-[var(--color-surface)] text-[var(--color-ink)] focus:ring-2 focus:ring-[var(--color-focus-ring)]" value={draft}>
          {behavior.options?.map((option) => <option key={option}>{option}</option>)}
        </select>
      );
    }
    return <Input {...inputProps} className="border-[var(--color-ink-border)] bg-[var(--color-surface)] text-[var(--color-ink)] focus:ring-2 focus:ring-[var(--color-focus-ring)]" type={behavior.editor} value={draft} />;
  };

  if (editing) return <div data-testid={testId}>{editor()}</div>;

  return (
    <Button
      type="button"
      variant="ghost"
      className={`w-full justify-start px-3 py-2 text-left text-sm ${error ? "text-[var(--color-destructive)]" : ""}`}
      data-testid={testId}
      data-value-type={typeof value}
      disabled={state === "read-only"}
      onClick={startEditing}
    >
      <span>{behavior.render(value)}</span>
      {error && <span className="ml-2 text-xs">#VALUE!</span>}
      {state === "read-only" && <span className="ml-2 text-xs">(read-only)</span>}
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
      aria-labelledby="harness-heading"
      className="rounded-xl border border-[var(--color-ink-hairline)] bg-[var(--color-card)] p-5"
    >
      <div className="mb-4">
        <p className="font-[var(--font-label)] text-xs uppercase tracking-[0.18em] text-[var(--color-primary)]">
          First harness
        </p>
        <h2 id="harness-heading" className="mt-1 text-xl font-semibold text-[var(--color-ink)]">
          Text harness
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

const GALLERY_STATES: CellState[] = ["display", "editing", "error", "read-only"];
const GALLERY_SHAPES = ["text", "number", "date", "boolean", "dropdown", "entity-picker", "future-shape"];

function CellGallery() {
  return (
    <section aria-labelledby="cell-gallery-heading" className="rounded-xl border border-[var(--color-ink-hairline)] bg-[var(--color-card)] p-5">
      <div className="mb-4">
        <p className="font-[var(--font-label)] text-xs uppercase tracking-[0.18em] text-[var(--color-primary)]">Operand shape registry</p>
        <h2 id="cell-gallery-heading" className="mt-1 text-xl font-semibold text-[var(--color-ink)]">Cell gallery</h2>
        <p className="mt-1 text-sm text-[var(--color-ink-muted-foreground)]">Every registered cell shape in display, editing, error, and read-only states. Values are local mock data.</p>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHead><TableRow><TableHeaderCell>Operand shape</TableHeaderCell>{GALLERY_STATES.map((state) => <TableHeaderCell key={state}>{state}</TableHeaderCell>)}</TableRow></TableHead>
          <tbody>
            {GALLERY_SHAPES.map((shape) => (
              <TableRow key={shape}>
                <TableHeaderCell>{shape}</TableHeaderCell>
                {GALLERY_STATES.map((state) => <TableCell key={state} className="min-w-40 p-0"><GalleryCell operandShape={shape} state={state} testId={`gallery-${shape}-${state}`} onTypedCommit={() => undefined} /></TableCell>)}
              </TableRow>
            ))}
          </tbody>
        </Table>
      </div>
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

      <CellGallery />
      <HarnessTable />

      {PLACEHOLDER_SECTIONS.map((title) => (
        <PlaceholderSection key={title} title={title} />
      ))}
    </main>
  );
}

export default TablesPlayground;
