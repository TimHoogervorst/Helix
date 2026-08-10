/**
 * Generic cell editor components dispatched by operand_shape.
 *
 * Each component receives a {@link CellEditorProps} bag and renders
 * the appropriate inline editor for that shape.  Consumers look up the
 * correct component via {@link getCellEditor} or the exported
 * {@link CELL_EDITOR_MAP}.
 *
 * These are renderer-agnostic — they do not depend on TipTap, the ELN,
 * or any mod.  They live in the shell so that every consumer of the
 * column type registry renders cells consistently.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Type,
  Hash,
  Calendar,
  Clock,
  ToggleLeft,
  ChevronDown,
  Link,
  User,
  FileText,
  type LucideIcon,
} from "lucide-react";
import { useClickOutside } from "../hooks/useClickOutside";
import MentionBadge from "./MentionBadge";
import { EntityPickerPopover } from "./EntityPickerPopover";

// ── Shared props ────────────────────────────────────────────────────────────

export interface CellEditorProps {
  /** The current cell value. */
  value: unknown;
  /** Called when the user commits a new value. */
  onCommit: (value: unknown) => void;
  /** When true, the cell renders as read-only display. */
  readOnly?: boolean;
  /** Additional context (e.g. the column name). */
  columnName?: string;
  /** Dropdown options for dropdown-type cells. When provided, the cell renders
   *  as a popover picker. When omitted or empty, falls back to text editing. */
  dropdownOptions?: string[];
  /** ID of the target Schema when the column type is "reference". Scopes the
   *  entity picker search to entities of that schema. */
  referenceSchemaId?: number;
  /** Workspace context for the consuming cell (e.g. "eln", "lims"). */
  workspaceId?: string;
}

/** Signature of a cell editor React component. */
export type CellEditorComponent = React.ComponentType<CellEditorProps>;

// ── Text Cell ───────────────────────────────────────────────────────────────

function TextCell({ value, onCommit }: CellEditorProps) {
  const ref = useRef<HTMLSpanElement>(null);

  const handleBlur = useCallback(() => {
    const newVal = ref.current?.textContent ?? "";
    if (newVal !== ((value as string) ?? "")) {
      onCommit(newVal);
    }
  }, [value, onCommit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLSpanElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        (e.target as HTMLElement).blur();
      }
    },
    [],
  );

  return (
    <span
      ref={ref}
      className="outline-none min-w-[60px] inline-block px-4 py-2 rounded hover:bg-surface/50 focus:bg-surface/80"
      contentEditable
      suppressContentEditableWarning
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      data-testid="text-cell"
    >
      {(value as string) || ""}
    </span>
  );
}

// ── Number Cell ─────────────────────────────────────────────────────────────

function NumberCell({ value, onCommit }: CellEditorProps) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        className="w-full bg-surface/80 px-4 py-2 rounded border border-primary/30 outline-none"
        defaultValue={value != null ? String(value) : ""}
        onBlur={(e) => {
          const raw = e.target.value.trim();
          const num = raw === "" ? null : Number(raw);
          onCommit(isNaN(num as number) ? null : num);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.target as HTMLElement).blur();
          } else if (e.key === "Escape") {
            setEditing(false);
          }
        }}
        data-testid="number-input"
      />
    );
  }

  return (
    <span
      className="cursor-text min-w-[40px] inline-block px-4 py-2 rounded hover:bg-surface/50 tabular-nums"
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setEditing(true);
        }
      }}
      tabIndex={0}
      data-testid="number-display"
    >
      {value != null ? String(value) : ""}
    </span>
  );
}

// ── Date Cell ───────────────────────────────────────────────────────────────

function DateCell({ value, onCommit }: CellEditorProps) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="date"
        className="bg-surface/80 px-4 py-2 rounded border border-primary/30 outline-none"
        defaultValue={(value as string) ?? ""}
        onBlur={(e) => {
          const raw = e.target.value;
          onCommit(raw || null);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.target as HTMLElement).blur();
          } else if (e.key === "Escape") {
            setEditing(false);
          }
        }}
        data-testid="date-input"
      />
    );
  }

  const display = (value as string)
    ? new Date((value as string) + "T00:00:00").toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "";

  return (
    <span
      className="cursor-text min-w-[80px] inline-block px-4 py-2 rounded hover:bg-surface/50"
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setEditing(true);
        }
      }}
      tabIndex={0}
      data-testid="date-display"
    >
      {display || ""}
    </span>
  );
}

// ── Boolean Cell ────────────────────────────────────────────────────────────

function BooleanCell({ value, onCommit }: CellEditorProps) {
  return (
    <div className="flex items-center justify-center px-4 py-2">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-hairline cursor-pointer accent-primary"
        checked={value === true}
        onChange={(e) => onCommit(e.target.checked)}
        data-testid="boolean-checkbox"
      />
    </div>
  );
}

// ── Reference Cell ─────────────────────────────────────────────────────────

function ReferenceCell({
  value,
  onCommit,
  readOnly = false,
  referenceSchemaId,
  workspaceId,
}: CellEditorProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const handleSelect = useCallback(
    (displayId: string) => {
      onCommit(displayId);
    },
    [onCommit],
  );

  const handleClear = useCallback(() => {
    onCommit("");
  }, [onCommit]);

  return (
    <div className="relative inline-flex items-center gap-1 px-4 py-2">
      {Boolean(value) ? (
        <div className="flex items-center gap-1">
          <MentionBadge displayId={value as string} clickable />
          {!readOnly && (
            <button
              type="button"
              className="text-muted-foreground hover:text-destructive text-xs leading-none px-0.5"
              onClick={handleClear}
              title="Clear reference"
              aria-label="Clear reference"
              data-testid="ref-clear-btn"
            >
              ×
            </button>
          )}
        </div>
      ) : (
        !readOnly && (
          <button
            ref={triggerRef}
            type="button"
            className="bg-transparent border-transparent text-xs text-muted-foreground italic px-1 py-0.5 rounded hover:bg-muted hover:text-muted-foreground"
            onClick={() => setOpen(true)}
            data-testid="ref-trigger-btn"
          >
            @mention…
          </button>
        )
      )}

      <EntityPickerPopover
        referenceSchemaId={referenceSchemaId}
        workspaceId={workspaceId}
        open={open}
        onOpenChange={setOpen}
        onSelect={handleSelect}
        onClear={Boolean(value) ? handleClear : undefined}
      />
    </div>
  );
}

// ── Dropdown Cell (popover picker) ─────────────────────────────────────────────

function DropdownCell({
  value,
  onCommit,
  readOnly = false,
  dropdownOptions,
}: CellEditorProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // ── Close on outside click ────────────────────────────────────────────
  useClickOutside([triggerRef, popoverRef], () => setOpen(false), open);

  // ── Fall back to text editing when no dropdown options ────────────────
  const options = dropdownOptions ?? [];
  if (options.length === 0) {
    return (
      <TextCell
        value={value}
        onCommit={onCommit}
        readOnly={readOnly}
      />
    );
  }

  // ── Select an option ──────────────────────────────────────────────────
  const handleSelect = useCallback(
    (option: string) => {
      onCommit(option);
      setOpen(false);
    },
    [onCommit],
  );

  // ── Clear the selection ───────────────────────────────────────────────
  const handleClear = useCallback(() => {
    onCommit("");
    setOpen(false);
  }, [onCommit]);

  return (
    <div className="relative inline-flex items-center gap-1 px-4 py-2">
      {Boolean(value) ? (
        <div className="flex items-center gap-1">
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-surface/60 text-foreground border border-hairline">
            {String(value)}
          </span>
          {!readOnly && (
            <button
              type="button"
              className="text-muted-foreground hover:text-destructive text-xs leading-none px-0.5"
              onClick={handleClear}
              title="Clear value"
              aria-label="Clear value"
              data-testid="sel-clear-btn"
            >
              ×
            </button>
          )}
        </div>
      ) : (
        !readOnly && (
          <button
            ref={triggerRef}
            type="button"
            className="bg-transparent border-transparent text-xs text-muted-foreground italic px-1 py-0.5 rounded hover:bg-muted hover:text-muted-foreground"
            onClick={() => setOpen(true)}
            data-testid="sel-trigger-btn"
          >
            Select…
          </button>
        )
      )}

      {/* ── Popover — portaled to body ────────────────────────────────── */}
      {open &&
        createPortal(
          <div
            ref={popoverRef}
            className="z-50 w-56 rounded-md border border-hairline bg-popover shadow-lg"
            style={{
              position: "fixed",
              top:
                (triggerRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
              left: triggerRef.current?.getBoundingClientRect().left ?? 0,
            }}
            data-testid="sel-popover"
          >
            <div className="max-h-48 overflow-y-auto py-1">
              {options.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={`w-full px-3 py-1.5 text-left text-sm hover:bg-surface/60 transition-colors ${
                    value === opt ? "bg-surface/40 font-medium" : ""
                  }`}
                  onClick={() => handleSelect(opt)}
                  data-testid={`sel-option-${opt}`}
                >
                  {opt}
                </button>
              ))}
            </div>
            {Boolean(value) && (
              <div className="border-t border-hairline p-1">
                <button
                  type="button"
                  className="w-full text-left px-2 py-1 text-xs text-destructive hover:bg-surface/60 rounded"
                  onClick={handleClear}
                  data-testid="sel-clear-option"
                >
                  Clear value
                </button>
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

// ── Lookup table ────────────────────────────────────────────────────────────

/**
 * Maps an ``operand_shape`` (from the column type registry) to the
 * React component that renders / edits a cell value of that shape.
 *
 * Shape IDs correspond to the values used by the backend
 * ``OperatorMeta.operand_shape`` and ``ColumnType.operand_shape``.
 *
 * Valid shapes: ``"text"``, ``"number"``, ``"date"``, ``"boolean"``,
 * ``"dropdown"``, ``"entity-picker"``, ``"range"``, ``"none"``.
 *
 * Missing shapes (``"range"``, ``"none"``) fall back to ``TextCell``
 * because they don't have a natural inline cell editor.
 */
export const CELL_EDITOR_MAP: Record<string, CellEditorComponent> = {
  text: TextCell,
  number: NumberCell,
  date: DateCell,
  boolean: BooleanCell,
  dropdown: DropdownCell,
  "entity-picker": ReferenceCell,
  // "range" and "none" are not cell-editable shapes
};

/**
 * Return the cell editor component for a given ``operand_shape``.
 *
 * Falls back to ``TextCell`` for unknown or missing shapes (including
 * ``"range"`` and ``"none"``).
 */
export function getCellEditor(operandShape: string): CellEditorComponent {
  return CELL_EDITOR_MAP[operandShape] ?? TextCell;
}

// ── Icon lookup ─────────────────────────────────────────────────────────────

/**
 * Maps the backend icon token string (e.g. ``"type"``, ``"hash"``) to the
 * corresponding Lucide React component.
 *
 * This is the single place that translates the backend-owned icon names
 * into frontend React elements — every rendering site that needs a column
 * type icon routes through here.
 */
export const COLUMN_TYPE_ICON_MAP: Record<string, LucideIcon> = {
  type: Type,
  hash: Hash,
  calendar: Calendar,
  clock: Clock,
  "toggle-left": ToggleLeft,
  list: ChevronDown,
  link: Link,
  user: User,
  "file-text": FileText,
};

/**
 * Return the Lucide icon component for a column type's icon token.
 *
 * Returns ``undefined`` for unknown icon names — callers should provide
 * a fallback (e.g. a default icon or nothing).
 */
export function getColumnTypeIcon(
  iconName: string,
): LucideIcon | undefined {
  return COLUMN_TYPE_ICON_MAP[iconName];
}
