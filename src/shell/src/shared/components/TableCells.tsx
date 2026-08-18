/**
 * Controller-driven, full-cell typed table cells.
 *
 * Pairs with {@link useTableInteraction}: the controller owns the selection
 * and which cell is editing; {@link TypedFullCell} renders the display and
 * editor for a single cell. Display and editing modes render the exact same
 * box (`.table-cell-full` in styles.css), so the cell becomes the editor in
 * place — no nested form chrome, no layout shift.
 *
 * Shape dispatch uses the backend ``operand_shape`` vocabulary:
 * ``text`` | ``number`` | ``date`` | ``boolean`` | ``dropdown`` | ``entity-picker``.
 *
 * - ``dropdown`` / ``entity-picker`` render a full-cell ``<select>`` when
 *   ``options`` are provided.
 * - ``entity-picker`` without options but with ``referenceSchemaId`` opens
 *   the shared {@link EntityPickerPopover} anchored to the cell
 *   (registry-backed search) instead of an inline editor.
 * - Unknown shapes fall back to a text input.
 *
 * These components are renderer-agnostic — they do not depend on TipTap,
 * the ELN, or any mod.
 */

import { useRef, useState } from "react";
import type { TablePosition, useTableInteraction } from "../hooks/useTableInteraction";
import { EntityPickerPopover } from "./EntityPickerPopover";

// ── Types ───────────────────────────────────────────────────────────────────

export type TableCellValue = string | number | boolean | null;

export interface TableCellBehavior {
  editor: "text" | "number" | "date" | "checkbox" | "select";
  render: (value: TableCellValue) => string;
  parse: (raw: string) => TableCellValue;
}

const TEXT_BEHAVIOR: TableCellBehavior = {
  editor: "text",
  render: (value) => String(value ?? ""),
  parse: (raw) => raw,
};

/** Shared cell behavior keyed by the backend ``operand_shape`` contract. */
export const CELL_REGISTRY: Record<string, TableCellBehavior> = {
  text: TEXT_BEHAVIOR,
  number: {
    editor: "number",
    render: (value) => String(value ?? ""),
    parse: (raw) => {
      const value = Number(raw);
      if (raw.trim() === "" || Number.isNaN(value)) throw new Error("Enter a number");
      return value;
    },
  },
  date: {
    editor: "date",
    render: (value) => String(value ?? ""),
    parse: (raw) => {
      const [year, month, day] = raw.split("-").map(Number);
      const date = new Date(Date.UTC(year, month - 1, day));
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(raw) ||
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
      ) {
        throw new Error("Enter a date");
      }
      return raw;
    },
  },
  boolean: {
    editor: "checkbox",
    render: (value) =>
      value === null || value === undefined ? "" : value === true ? "True" : "False",
    parse: (raw) => {
      const normalized = raw.trim().toLowerCase();
      if (normalized !== "true" && normalized !== "false") {
        throw new Error("Enter true or false");
      }
      return normalized === "true";
    },
  },
  dropdown: {
    editor: "select",
    render: (value) => String(value ?? ""),
    parse: (raw) => raw,
  },
  "entity-picker": {
    editor: "select",
    render: (value) => String(value ?? ""),
    parse: (raw) => raw,
  },
};

export function getCellBehavior(operandShape: string): TableCellBehavior {
  return CELL_REGISTRY[operandShape] ?? TEXT_BEHAVIOR;
}

type TableInteraction = ReturnType<typeof useTableInteraction>;

/**
 * Full-cell geometry classes from styles.css — display and editing modes
 * render the exact same box so the cell becomes the editor in place.
 */
const FULL_CELL = "table-cell-full";
const FULL_CELL_EDITOR = "table-cell-full table-cell-full--editing";

// ── Value helpers ───────────────────────────────────────────────────────────

/**
 * Display string for a typed cell value. Also used to serialise cells for
 * TSV copy, so it round-trips with {@link parseCellValue}.
 */
export function renderCellValue(shape: string, value: unknown): string {
  return getCellBehavior(shape).render(value as TableCellValue);
}

/**
 * Parse a raw edited or pasted string into a typed value.
 * Throws when the input is invalid for the shape — callers decide whether
 * to surface an error state (editing) or skip the cell (paste).
 */
export function parseCellValue(shape: string, raw: string): TableCellValue {
  return getCellBehavior(shape).parse(raw);
}

// ── Typed full cell ─────────────────────────────────────────────────────────

export interface TypedFullCellProps {
  /** Operand shape: ``text`` | ``number`` | ``date`` | ``boolean`` | ``dropdown`` | ``entity-picker``. */
  shape: string;
  /** The current cell value. */
  value: unknown;
  /** Called with the parsed value when the user commits an edit. */
  onCommit: (value: TableCellValue) => void;
  /** This cell's position in the interaction controller's grid. */
  position: TablePosition;
  /** The table's interaction controller (owns selection + editing state). */
  interaction: TableInteraction;
  /** When true, the cell displays but never enters edit mode. */
  readOnly?: boolean;
  /** Options for dropdown / entity-picker select editors. */
  options?: string[];
  /** Schema PK scoping the entity-picker popover search. */
  referenceSchemaId?: number;
  /** Schema Type PK scoping the entity-picker popover search. */
  referenceSchemaTypeId?: number;
  /** Workspace context for the entity-picker popover (metadata only). */
  workspaceId?: string;
  /** Placeholder shown in the display state when the value is empty. */
  placeholder?: string;
  "data-testid"?: string;
}

export function TypedFullCell({
  shape,
  value,
  onCommit,
  position,
  interaction,
  readOnly = false,
  options,
  referenceSchemaId,
  referenceSchemaTypeId,
  workspaceId,
  placeholder,
  "data-testid": testId,
}: TypedFullCellProps) {
  const editing =
    !readOnly &&
    interaction.editingCell?.row === position.row &&
    interaction.editingCell?.column === position.column;
  const [draft, setDraft] = useState(() => renderCellValue(shape, value));
  const [error, setError] = useState(false);
  const cancelled = useRef(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  const startEditing = () => {
    if (readOnly) return;
    setDraft(renderCellValue(shape, value));
    setError(false);
    interaction.activateCell(position);
  };

  const commit = () => {
    try {
      onCommit(parseCellValue(shape, draft));
      setError(false);
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

  const handleEditorKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    interaction.handleEditorKeyDown(position, event, {
      commit,
      cancel: () => {
        cancelled.current = true;
        setError(false);
      },
    });
  };

  const display = renderCellValue(shape, value);
  const displayContent =
    display !== "" ? display : placeholder ? (
      <span className="italic text-muted-foreground">{placeholder}</span>
    ) : null;

  // ── Entity-picker popover editor (registry-backed search) ──────────────
  // Used when no static options are provided and the cell has registry
  // context (a target schema, or a workspace enabling unscoped search).
  const usePopoverEditor =
    shape === "entity-picker" &&
    !options?.length &&
    (referenceSchemaId !== undefined || referenceSchemaTypeId !== undefined || workspaceId !== undefined);

  if (usePopoverEditor) {
    return (
      <>
        <button
          ref={anchorRef}
          type="button"
          className={FULL_CELL}
          data-testid={testId}
          disabled={readOnly}
          tabIndex={-1}
          onClick={startEditing}
        >
          {displayContent}
        </button>
        <EntityPickerPopover
          referenceSchemaId={referenceSchemaId}
          referenceSchemaTypeId={referenceSchemaTypeId}
          workspaceId={workspaceId}
          open={editing}
          onOpenChange={(open) => {
            if (!open && editing) interaction.cancelEditing(position);
          }}
          onSelect={(displayId) => {
            onCommit(displayId);
            interaction.finishEditing();
            interaction.moveTo({ row: position.row + 1, column: position.column });
          }}
          anchorRef={anchorRef}
        />
      </>
    );
  }

  // ── Inline full-cell editor ────────────────────────────────────────────
  if (editing) {
    const behavior = getCellBehavior(shape);

    if (behavior.editor === "checkbox") {
      return (
        <div className="h-full w-full">
          <label className={FULL_CELL_EDITOR} data-testid={testId}>
            <input
              autoFocus
              type="checkbox"
              className="accent-[var(--color-primary)]"
              checked={draft === "true"}
              data-testid={testId ? `${testId}-input` : undefined}
              onBlur={commitOnBlur}
              onChange={(event) => setDraft(String(event.currentTarget.checked))}
              onKeyDown={handleEditorKeyDown}
            />
            <span>{draft === "true" ? "True" : "False"}</span>
          </label>
        </div>
      );
    }

    if (behavior.editor === "select" && options?.length) {
      return (
        <div className="h-full w-full">
          <select
            autoFocus
            className={FULL_CELL_EDITOR}
            data-testid={testId ? `${testId}-input` : undefined}
            value={draft}
            onBlur={commitOnBlur}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={handleEditorKeyDown}
          >
            {options.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </div>
      );
    }

    return (
      <div className="h-full w-full">
        <input
          autoFocus
          className={FULL_CELL_EDITOR}
          data-testid={testId ? `${testId}-input` : undefined}
          type={behavior.editor === "number" || behavior.editor === "date" ? behavior.editor : "text"}
          value={draft}
          onBlur={commitOnBlur}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={handleEditorKeyDown}
        />
      </div>
    );
  }

  // ── Display state ──────────────────────────────────────────────────────
  return (
    <button
      type="button"
      className={error ? `${FULL_CELL} table-cell-full--error` : FULL_CELL}
      data-testid={testId}
      data-value-type={typeof value}
      disabled={readOnly}
      tabIndex={-1}
      onClick={startEditing}
    >
      {displayContent}
      {error && <span className="ml-2 text-xs">#VALUE!</span>}
    </button>
  );
}
