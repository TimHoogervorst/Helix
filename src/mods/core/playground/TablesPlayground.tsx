import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Table,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "../../../shell/src/shared/primitives/Table";
import { Input } from "../../../shell/src/shared/primitives/Input";
import { Select } from "../../../shell/src/shared/primitives/Input";
import { Button } from "../../../shell/src/shared/primitives/Button";
import {
  StickyActionCell,
  StickyActionHeader,
  TableChrome,
  TableScroll,
  TableStretch,
} from "../../../shell/src/shared/primitives/TableLayout";
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

  useEffect(() => {
    if (editing && interaction.editingDraft !== null) setDraft(interaction.editingDraft);
  }, [editing, interaction.editingDraft]);

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
      onDoubleClick={startEditing}
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

  if (behavior.editor === "checkbox" && state !== "read-only") {
    return (
      <label className={FULL_CELL} data-testid={testId} data-value-type={typeof value}>
        <input
          type="checkbox"
          className="accent-[var(--color-primary)]"
          checked={value === true}
          onClick={(event) => interaction.handleCellClick(position, event)}
          onChange={(event) => {
            const next = event.currentTarget.checked;
            setValue(next);
            onTypedCommit(next);
          }}
        />
        <span>{value === true ? "True" : "False"}</span>
      </label>
    );
  }

  return (
    <button
      type="button"
      className={error ? `${FULL_CELL} table-cell-full--error` : FULL_CELL}
      data-testid={testId}
      data-value-type={typeof value}
      disabled={state === "read-only"}
      tabIndex={-1}
      onDoubleClick={startEditing}
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
    onClear: (positions) => setRows((currentRows) => currentRows.map((row, rowIndex) => {
      const next = { ...row };
      for (const position of positions.filter((candidate) => candidate.row === rowIndex)) {
        const column = (["name", "role", "note"] as const)[position.column];
        if (column) next[column] = "";
      }
      return next;
    })),
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
           Interaction bench
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
    onClear: () => undefined,
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

const LAYOUT_ROWS = [
  ["Aster", "Research", "Buffer", "Ready"],
  ["Nova", "Assay", "Sample", "Review"],
  ["Elm", "Analysis", "Control", "Queued"],
];

function LayoutDemo() {
  const [mode, setMode] = useState<"auto" | "full">("auto");

  return (
    <section aria-labelledby="layout-demo-heading" className="rounded-xl border border-[var(--color-ink-hairline)] bg-[var(--color-card)] p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-[var(--font-label)] text-xs uppercase tracking-[0.18em] text-[var(--color-primary)]">Layout primitives</p>
          <h2 id="layout-demo-heading" className="mt-1 text-xl font-semibold text-[var(--color-ink)]">Layout demo</h2>
          <p className="mt-1 text-sm text-[var(--color-ink-muted-foreground)]">Scroll the wide grid. The action column stays pinned while the scrollbar appears on hover.</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setMode((current) => current === "auto" ? "full" : "auto")}
          aria-label={mode === "auto" ? "Stretch table to full width" : "Auto-fit table to content"}
          aria-pressed={mode === "full"}
          data-testid="layout-stretch-toggle"
        >
          {mode === "auto" ? "Auto stretch" : "Full stretch"}
        </Button>
      </div>
      <TableStretch mode={mode} data-testid="layout-stretch-wrapper">
        <TableChrome
          title="Assay results"
          toolbar={<span data-testid="layout-toolbar-slot" className="text-xs text-[var(--color-ink-muted-foreground)]">Toolbar slot</span>}
          addRow={<Button variant="ghost" size="sm" data-testid="layout-add-row">+ Add row</Button>}
          data-testid="layout-table-chrome"
        >
          <TableScroll mode={mode} data-testid="layout-scroll-container">
            <Table className="table-layout-demo-grid" data-testid="layout-wide-table">
              <TableHead>
                <TableRow>
                  {['Source', 'Experiment', 'Material', 'Status', 'Notes'].map((heading) => (
                    <TableHeaderCell key={heading}>{heading}</TableHeaderCell>
                  ))}
                  <StickyActionHeader aria-label="Actions" data-testid="layout-action-header" />
                </TableRow>
              </TableHead>
              <tbody>
                {LAYOUT_ROWS.map((row, index) => (
                  <TableRow key={row[0]} data-testid={`layout-row-${index}`}>
                    {row.map((value) => <TableCell key={value} className="whitespace-nowrap">{value}</TableCell>)}
                    <TableCell className="table-layout-demo-wide-cell whitespace-nowrap text-[var(--color-ink-muted-foreground)]">Long-form observation for horizontal scrolling</TableCell>
                    <StickyActionCell>
                      <Button variant="ghost" size="sm" aria-label={`Actions for ${row[0]}`} data-testid={`layout-action-${index}`}>...</Button>
                    </StickyActionCell>
                  </TableRow>
                ))}
              </tbody>
            </Table>
          </TableScroll>
        </TableChrome>
      </TableStretch>
    </section>
  );
}

type PrototypeColumn = {
  id: string;
  label: string;
  shape: keyof typeof CELL_REGISTRY;
};

type PrototypeRow = {
  id: string;
  values: Record<string, CellValue>;
  registered?: boolean;
};

function InteractiveMockCell({
  value,
  shape,
  position,
  interaction,
  testId,
  readOnly = false,
  onCommit,
}: {
  value: CellValue;
  shape: keyof typeof CELL_REGISTRY;
  position: TablePosition;
  interaction: ReturnType<typeof useTableInteraction>;
  testId: string;
  readOnly?: boolean;
  onCommit: (value: CellValue) => void;
}) {
  const behavior = getCellBehavior(shape);
  const editing = !readOnly && interaction.editingCell?.row === position.row && interaction.editingCell?.column === position.column;
  const [draft, setDraft] = useState(behavior.render(value));
  const [error, setError] = useState(false);
  const cancelled = useRef(false);

  useEffect(() => {
    if (editing && interaction.editingDraft !== null) setDraft(interaction.editingDraft);
  }, [editing, interaction.editingDraft]);

  const startEditing = () => {
    setDraft(behavior.render(value));
    setError(false);
    interaction.activateCell(position);
  };
  const commit = () => {
    try {
      onCommit(behavior.commit(draft));
      setError(false);
    } catch {
      setError(true);
    }
  };
  const finishBlur = () => {
    if (cancelled.current) {
      cancelled.current = false;
      interaction.finishEditing();
      return;
    }
    commit();
    interaction.finishEditing();
  };

  if (editing) {
    const common = {
      autoFocus: true,
      onBlur: finishBlur,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setDraft(
        event.currentTarget instanceof HTMLInputElement && event.currentTarget.type === "checkbox"
          ? String(event.currentTarget.checked)
          : event.currentTarget.value,
      ),
      onKeyDown: (event: React.KeyboardEvent) => interaction.handleEditorKeyDown(position, event, {
        commit,
        cancel: () => {
          cancelled.current = true;
          setError(false);
        },
      }),
    };
    if (shape === "entity-picker") {
      return <select {...common} className={FULL_CELL_EDITOR} data-testid={`${testId}-input`} value={draft}>
        {MOCK_ENTITIES.map((entity) => <option key={entity}>{entity}</option>)}
      </select>;
    }
    if (behavior.editor === "select") {
      return <select {...common} className={FULL_CELL_EDITOR} data-testid={`${testId}-input`} value={draft}>
        {behavior.options?.map((option) => <option key={option}>{option}</option>)}
      </select>;
    }
    if (behavior.editor === "checkbox") {
      return <label className={FULL_CELL_EDITOR} data-testid={`${testId}-input`}>
        <input {...common} type="checkbox" checked={draft === "true"} />
        <span>{draft === "true" ? "True" : "False"}</span>
      </label>;
    }
    return <input {...common} className={FULL_CELL_EDITOR} data-testid={`${testId}-input`} type={behavior.editor} value={draft} />;
  }

  if (behavior.editor === "checkbox" && !readOnly) {
    return (
      <label className={FULL_CELL} data-testid={testId} data-value-type={typeof value}>
        <input
          type="checkbox"
          className="accent-[var(--color-primary)]"
          checked={value === true}
          onClick={(event) => interaction.handleCellClick(position, event)}
          onChange={(event) => onCommit(event.currentTarget.checked)}
        />
        <span>{value === true ? "True" : "False"}</span>
      </label>
    );
  }

  return <button
    type="button"
    className={error ? `${FULL_CELL} table-cell-full--error` : FULL_CELL}
    data-testid={testId}
    data-value-type={typeof value}
    disabled={readOnly}
    tabIndex={-1}
    onDoubleClick={startEditing}
  >
    {behavior.render(value)}{error && <span className="ml-2 text-xs">#VALUE!</span>}
  </button>;
}

const MOCK_ENTITIES = ["SMP-001", "SMP-002", "CTRL-001"];

function parsePastedValue(column: PrototypeColumn, raw: string): CellValue | undefined {
  if (column.shape === "entity-picker" && !MOCK_ENTITIES.includes(raw)) return undefined;
  try {
    return getCellBehavior(column.shape).commit(raw);
  } catch {
    return undefined;
  }
}

const SCHEMA_MODES = {
  name: {
    label: "Name column",
    description: "Registry Table rehearsal: names, typed properties, status dots, and mock registration.",
    columns: [
      { id: "name", label: "Name", shape: "text" },
      { id: "status", label: "Status", shape: "dropdown" },
      { id: "concentration", label: "Concentration", shape: "number" },
      { id: "active", label: "Active", shape: "boolean" },
    ] satisfies PrototypeColumn[],
  },
  entity: {
    label: "Entity column",
    description: "Result Table rehearsal: constrained source entities, typed values, status dots, and mock registration.",
    columns: [
      { id: "entity", label: "Source entity", shape: "entity-picker" },
      { id: "amount", label: "Amount", shape: "number" },
      { id: "count", label: "Count", shape: "number" },
    ] satisfies PrototypeColumn[],
  },
} as const;

function RegistrationStatus({ registered }: { registered?: boolean }) {
  return <span className="inline-flex items-center gap-2 text-xs text-[var(--color-ink-muted-foreground)]">
    <span aria-hidden="true" className={`h-2 w-2 rounded-full ${registered ? "bg-[var(--color-success)]" : "bg-[var(--color-ink-muted-foreground)]"}`} />
    {registered ? "Registered" : "Draft"}
  </span>;
}

function SchemaDrivenPrototype() {
  const [mode, setMode] = useState<keyof typeof SCHEMA_MODES>("name");
  const [rows, setRows] = useState<PrototypeRow[]>([
    { id: "schema-row-1", values: { name: "Aster", status: "Researcher", concentration: 12, active: true, entity: "SMP-001", amount: 12, count: 3 } },
    { id: "schema-row-2", values: { name: "Briar", status: "Reviewer", concentration: 8, active: false, entity: "SMP-002", amount: 8, count: 2 } },
  ]);
  const schema = SCHEMA_MODES[mode];
  const interaction = useTableInteraction({
    tableId: "schema-prototype",
    rowCount: rows.length,
    columnCount: schema.columns.length,
    getValues: () => rows.map((row) => schema.columns.map((column) => String(row.values[column.id] ?? ""))),
    onClear: (positions) => setRows((current) => current.map((row, rowIndex) => {
      const rowPositions = positions.filter((candidate) => candidate.row === rowIndex);
      const values = { ...row.values };
      for (const position of rowPositions) {
        const column = schema.columns[position.column];
        if (column) values[column.id] = "";
      }
      return rowPositions.length ? { ...row, registered: false, values } : row;
    })),
    onPaste: (anchor, values) => setRows((current) => current.map((row, rowIndex) => {
      const pasted = values[rowIndex - anchor.row];
      if (!pasted || rowIndex < anchor.row) return row;
      const next = { ...row.values };
      schema.columns.slice(anchor.column).forEach((column, offset) => {
        const parsed = pasted[offset] === undefined ? undefined : parsePastedValue(column, pasted[offset]);
        if (parsed !== undefined) next[column.id] = parsed;
      });
      return { ...row, values: next, registered: false };
    })),
  });
  const update = (rowId: string, columnId: string, value: CellValue) => setRows((current) => current.map((row) => row.id === rowId ? { ...row, registered: false, values: { ...row.values, [columnId]: value } } : row));
  const register = (rowId: string) => setRows((current) => current.map((row) => row.id === rowId ? { ...row, registered: true } : row));

  return <section aria-labelledby="prototype-tables-heading" className="rounded-xl border border-[var(--color-ink-hairline)] bg-[var(--color-card)] p-5">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
      <div><p className="font-[var(--font-label)] text-xs uppercase tracking-[0.18em] text-[var(--color-primary)]">Schema-driven</p><h2 id="prototype-tables-heading" className="mt-1 text-xl font-semibold text-[var(--color-ink)]">Prototype tables</h2><p className="mt-1 text-sm text-[var(--color-ink-muted-foreground)]">{schema.description} All data is local mock data.</p></div>
      <div className="flex gap-2" role="group" aria-label="Schema mode">
        {(Object.keys(SCHEMA_MODES) as Array<keyof typeof SCHEMA_MODES>).map((key) => <Button key={key} size="sm" variant={mode === key ? "primary" : "ghost"} onClick={() => setMode(key)} aria-pressed={mode === key} data-testid={`schema-mode-${key}`}>{SCHEMA_MODES[key].label}</Button>)}
      </div>
    </div>
    <div ref={interaction.containerRef} onCopy={interaction.handleCopy} onPaste={interaction.handlePaste} data-testid="schema-prototype-table">
      <Table><TableHead><TableRow>{schema.columns.map((column) => <TableHeaderCell key={column.id}>{column.label}</TableHeaderCell>)}<StickyActionHeader aria-label="Registration" /></TableRow></TableHead><tbody>
        {rows.map((row, rowIndex) => <TableRow key={row.id}>{schema.columns.map((column, columnIndex) => {
          return <TableCell key={column.id} className="p-0!" {...interaction.cellProps({ row: rowIndex, column: columnIndex })}>
            <InteractiveMockCell value={row.values[column.id]} shape={column.shape} position={{ row: rowIndex, column: columnIndex }} interaction={interaction} testId={`schema-cell-${row.id}-${column.id}`} onCommit={(next) => update(row.id, column.id, next)} />
          </TableCell>;
        })}<StickyActionCell><div className="flex items-center gap-2 px-2"><RegistrationStatus registered={row.registered} /><Button size="sm" variant="ghost" onClick={() => register(row.id)} data-testid={`register-${row.id}`}>Register</Button></div></StickyActionCell></TableRow>)}
      </tbody></Table>
    </div>
  </section>;
}

function FreeFormPrototype() {
  const [columns, setColumns] = useState<PrototypeColumn[]>([
    { id: "item", label: "Item", shape: "text" },
    { id: "quantity", label: "Quantity", shape: "number" },
    { id: "when", label: "When", shape: "date" },
    { id: "ready", label: "Ready", shape: "boolean" },
  ]);
  const [rows, setRows] = useState<PrototypeRow[]>([{ id: "free-row-1", values: { item: "Buffer", quantity: 3, when: "2026-08-16", ready: true } }, { id: "free-row-2", values: { item: "Sample", quantity: 8, when: "2026-08-17", ready: false } }]);
  const interaction = useTableInteraction({
    tableId: "free-form-prototype",
    rowCount: rows.length,
    columnCount: columns.length,
    getValues: () => rows.map((row) => columns.map((column) => String(row.values[column.id] ?? ""))),
    onClear: (positions) => setRows((current) => current.map((row, rowIndex) => {
      const rowPositions = positions.filter((candidate) => candidate.row === rowIndex);
      const values = { ...row.values };
      for (const position of rowPositions) {
        const column = columns[position.column];
        if (column) values[column.id] = "";
      }
      return rowPositions.length ? { ...row, values } : row;
    })),
    onPaste: (anchor, values) => setRows((current) => current.map((row, rowIndex) => {
      const pasted = values[rowIndex - anchor.row];
      if (!pasted || rowIndex < anchor.row) return row;
      const next = { ...row.values };
      columns.slice(anchor.column).forEach((column, offset) => {
        const parsed = pasted[offset] === undefined ? undefined : parsePastedValue(column, pasted[offset]);
        if (parsed !== undefined) next[column.id] = parsed;
      });
      return { ...row, values: next };
    })),
  });
  return <section aria-labelledby="free-form-heading" className="rounded-xl border border-[var(--color-ink-hairline)] bg-[var(--color-card)] p-5"><div className="mb-4"><p className="font-[var(--font-label)] text-xs uppercase tracking-[0.18em] text-[var(--color-primary)]">Free-form</p><h2 id="free-form-heading" className="mt-1 text-xl font-semibold text-[var(--color-ink)]">Plain Table prototype</h2><p className="mt-1 text-sm text-[var(--color-ink-muted-foreground)]">Choose each column type, then exercise typed editing, navigation, and TSV copy-paste. No schema or registration is involved.</p></div>
    <div ref={interaction.containerRef} onCopy={interaction.handleCopy} onPaste={interaction.handlePaste} data-testid="free-form-prototype-table"><Table><TableHead><TableRow>{columns.map((column) => <TableHeaderCell key={column.id}><label className="flex flex-col gap-1"><span>{column.label}</span><Select aria-label={`Type for ${column.label}`} value={column.shape} onChange={(event) => setColumns((current) => current.map((item) => item.id === column.id ? { ...item, shape: event.target.value as keyof typeof CELL_REGISTRY } : item))}><option value="text">Text</option><option value="number">Number</option><option value="date">Date</option><option value="boolean">Boolean</option><option value="dropdown">Dropdown</option><option value="entity-picker">Reference</option></Select></label></TableHeaderCell>)}</TableRow></TableHead><tbody>{rows.map((row, rowIndex) => <TableRow key={row.id}>{columns.map((column, columnIndex) => <TableCell key={column.id} className="p-0!" {...interaction.cellProps({ row: rowIndex, column: columnIndex })}><InteractiveMockCell value={row.values[column.id]} shape={column.shape} position={{ row: rowIndex, column: columnIndex }} interaction={interaction} testId={`free-cell-${row.id}-${column.id}`} onCommit={(value) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, values: { ...item.values, [column.id]: value } } : item))} /></TableCell>)}</TableRow>)}</tbody></Table></div>
  </section>;
}

function CapabilityMatrix() {
  const rows = [
    ["Typed cells", "Registry", "Result", "Plain"],
    ["Keyboard navigation", "Yes", "Yes", "Yes"],
    ["TSV copy-paste", "Yes", "Yes", "Yes"],
    ["Registration", "Mock", "Mock", "No"],
  ];
  return <section aria-labelledby="capability-matrix-heading" className="rounded-xl border border-[var(--color-ink-hairline)] bg-[var(--color-card)] p-5"><p className="font-[var(--font-label)] text-xs uppercase tracking-[0.18em] text-[var(--color-primary)]">Coverage</p><h2 id="capability-matrix-heading" className="mt-1 text-xl font-semibold text-[var(--color-ink)]">Capability matrix</h2><div className="mt-4 overflow-x-auto"><Table><tbody>{rows.map((row, index) => <TableRow key={row[0]}>{row.map((value, cellIndex) => cellIndex === 0 ? <TableHeaderCell key={value}>{value}</TableHeaderCell> : <TableCell key={`${value}-${cellIndex}`}>{value}</TableCell>)}</TableRow>)}</tbody></Table></div></section>;
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
          A local sandbox for exploring typed cells and table interactions before they become shared product surfaces.
        </p>
      </header>

      <CellGallery />
      <HarnessTable />
      <LayoutDemo />

        <SchemaDrivenPrototype />
        <FreeFormPrototype />
        <CapabilityMatrix />
      </div>
    </main>
  );
}

export default TablesPlayground;
