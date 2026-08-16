import { useRef, useState, type ReactNode } from "react";
import {
  Table,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "../../../shell/src/shared/primitives/Table";
import { useTableInteraction, type TablePosition } from "../../../shell/src/shared/hooks/useTableInteraction";

interface HarnessRow {
  id: string;
  name: string;
  role: string;
  note: string;
}

type CellValue = string | number | boolean | null;
type CellState = "display" | "editing" | "error" | "read-only";

/**
 * Full-cell geometry: display and editing modes render the exact same box so the
 * cell becomes the editor in place — no nested form chrome, no layout shift.
 * The classes live in styles.css (`.table-cell-full`): the global unlayered
 * `input`/`select`/`label` rules beat Tailwind utilities, so the reset has to
 * win on source order there.
 */
const FULL_CELL = "table-cell-full";
const FULL_CELL_EDITOR = "table-cell-full table-cell-full--editing";

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
  position,
  interaction,
}: {
  value: string;
  onCommit: (value: string) => void;
  testId: string;
  position: TablePosition;
  interaction: ReturnType<typeof useTableInteraction>;
}) {
  const editing = interaction.editingCell?.row === position.row && interaction.editingCell?.column === position.column;
  const [draft, setDraft] = useState(value);
  const cancelled = useRef(false);

  const startEditing = () => {
    setDraft(value);
    interaction.activateCell(position);
  };

  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  const commitOnBlur = () => {
    if (cancelled.current) {
      cancelled.current = false;
      interaction.finishEditing();
      return;
    }
    commit();
    interaction.finishEditing();
  };

  if (editing) {
    return (
      <input
        autoFocus
        aria-label={`Edit ${testId}`}
        className={FULL_CELL_EDITOR}
        data-testid={`${testId}-input`}
        onBlur={commitOnBlur}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          interaction.handleEditorKeyDown(position, event, {
            commit,
            cancel: () => {
              cancelled.current = true;
              setDraft(value);
            },
          });
        }}
        type="text"
        value={draft}
      />
    );
  }

  return (
    <button
      type="button"
      className={FULL_CELL}
      data-testid={testId}
      tabIndex={-1}
      onClick={startEditing}
    >
      {value}
    </button>
  );
}

function GalleryCell({
  operandShape,
  state,
  testId,
  onTypedCommit,
  position,
  interaction,
}: {
  operandShape: string;
  state: CellState;
  testId: string;
  onTypedCommit: (value: CellValue) => void;
  position: TablePosition;
  interaction: ReturnType<typeof useTableInteraction>;
}) {
  const behavior = getCellBehavior(operandShape);
  const [value, setValue] = useState(behavior.initialValue);
  const [draft, setDraft] = useState(behavior.render(behavior.initialValue));
  const cancelled = useRef(false);
  const [initialEditing, setInitialEditing] = useState(state === "editing");
  const [error, setError] = useState(state === "error");
  const editing = initialEditing || (state !== "read-only" && interaction.editingCell?.row === position.row && interaction.editingCell?.column === position.column);

  const startEditing = () => {
    if (state === "read-only") return;
    setDraft(behavior.render(value));
    setError(false);
    interaction.activateCell(position);
  };

  const commit = () => {
    try {
      const next = behavior.commit(draft);
      setValue(next);
       setInitialEditing(false);
      setError(false);
      onTypedCommit(next);
    } catch {
      setError(true);
    }
  };

  const commitOnBlur = () => {
    if (cancelled.current) {
      cancelled.current = false;
      interaction.finishEditing();
      return;
    }
    commit();
    interaction.finishEditing();
  };

  const editor = (): ReactNode => {
    const inputProps = {
      autoFocus: true,
      "data-testid": `${testId}-input`,
       onBlur: commitOnBlur,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setDraft(
          event.currentTarget instanceof HTMLInputElement &&
            event.currentTarget.type === "checkbox"
            ? String(event.currentTarget.checked)
            : event.currentTarget.value,
        ),
        onKeyDown: (event: React.KeyboardEvent) => {
          interaction.handleEditorKeyDown(position, event, {
            commit,
            cancel: () => {
              cancelled.current = true;
              setInitialEditing(false);
              setError(false);
            },
          });
        },
    };

    if (behavior.editor === "checkbox") {
      return (
        <label className={FULL_CELL_EDITOR}>
          <input {...inputProps} className="accent-[var(--color-primary)]" type="checkbox" checked={draft === "true"} />
          <span>{draft === "true" ? "True" : "False"}</span>
        </label>
      );
    }
    if (behavior.editor === "select") {
      return (
        <select {...inputProps} className={FULL_CELL_EDITOR} value={draft}>
          {behavior.options?.map((option) => <option key={option}>{option}</option>)}
        </select>
      );
    }
    return <input {...inputProps} className={FULL_CELL_EDITOR} type={behavior.editor} value={draft} />;
  };

  if (editing) return <div className="h-full w-full" data-testid={testId}>{editor()}</div>;

  return (
    <button
      type="button"
      className={error ? `${FULL_CELL} table-cell-full--error` : FULL_CELL}
      data-testid={testId}
      data-value-type={typeof value}
      disabled={state === "read-only"}
      tabIndex={-1}
      onClick={startEditing}
    >
      <span>{behavior.render(value)}</span>
      {error && <span className="ml-2 text-xs">#VALUE!</span>}
      {state === "read-only" && <span className="ml-2 text-xs">(read-only)</span>}
    </button>
  );
}

function HarnessTable() {
  const [rows, setRows] = useState(INITIAL_ROWS);

  const interaction = useTableInteraction({
    rowCount: rows.length,
    columnCount: 3,
    getValues: () => rows.map(({ name, role, note }) => [name, role, note]),
    onPaste: (anchor, values) => {
      setRows((currentRows) => currentRows.map((row, rowIndex) => {
        const pastedRow = values[rowIndex - anchor.row];
        if (!pastedRow || rowIndex < anchor.row) return row;
        const columns = ["name", "role", "note"] as const;
        return columns.slice(anchor.column).reduce((nextRow, column, columnOffset) => {
          const pastedValue = pastedRow[columnOffset];
          return pastedValue === undefined
            ? nextRow
            : { ...nextRow, [column]: pastedValue };
        }, row);
      }));
    },
  });

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
      <div ref={interaction.containerRef} data-testid="harness-table" onCopy={interaction.handleCopy} onPaste={interaction.handlePaste}>
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>Name</TableHeaderCell>
            <TableHeaderCell>Role</TableHeaderCell>
            <TableHeaderCell>Note</TableHeaderCell>
          </TableRow>
        </TableHead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <TableRow key={row.id}>
              {(["name", "role", "note"] as const).map((column, columnIndex) => (
                <TableCell key={column} className="p-0!" {...interaction.cellProps({ row: rowIndex, column: columnIndex })}>
                  <TextHarnessCell
                    value={row[column]}
                    onCommit={(value) => updateCell(row.id, column, value)}
                    testId={`cell-${row.id}-${column}`}
                    position={{ row: rowIndex, column: columnIndex }}
                    interaction={interaction}
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </tbody>
      </Table>
      </div>
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
      <CellGalleryTable />
    </section>
  );
}

function CellGalleryTable() {
  const interaction = useTableInteraction({
    tableId: "gallery",
    rowCount: GALLERY_SHAPES.length,
    columnCount: GALLERY_STATES.length,
    getValues: () => GALLERY_SHAPES.map((shape) =>
      GALLERY_STATES.map((state) => getCellBehavior(shape).render(getCellBehavior(shape).initialValue)),
    ),
    onPaste: () => undefined,
  });

  return (
    <div className="overflow-x-scroll" ref={interaction.containerRef} onCopy={interaction.handleCopy} onPaste={interaction.handlePaste}>
      <Table className="min-w-[80rem]">
          <TableHead><TableRow><TableHeaderCell>Operand shape</TableHeaderCell>{GALLERY_STATES.map((state) => <TableHeaderCell key={state}>{state}</TableHeaderCell>)}</TableRow></TableHead>
          <tbody>
            {GALLERY_SHAPES.map((shape, rowIndex) => (
              <TableRow key={shape}>
                <TableHeaderCell>{shape}</TableHeaderCell>
                {GALLERY_STATES.map((state, columnIndex) => <TableCell key={state} className="min-w-40 p-0!" {...interaction.cellProps({ row: rowIndex, column: columnIndex })}><GalleryCell operandShape={shape} state={state} testId={`gallery-${shape}-${state}`} onTypedCommit={() => undefined} position={{ row: rowIndex, column: columnIndex }} interaction={interaction} /></TableCell>)}
              </TableRow>
            ))}
          </tbody>
        </Table>
    </div>
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
    <main
      className="h-full min-h-0 overflow-y-auto"
      data-testid="tables-playground"
    >
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
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
      </div>
    </main>
  );
}

export default TablesPlayground;
