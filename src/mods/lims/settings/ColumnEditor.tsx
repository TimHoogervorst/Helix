import { useState, useEffect } from "react";
import type { ColumnDef } from "../types";
import { ModRegistry } from "../../../shell/src/mod-system/ModRegistry";
import { listDropdowns } from "../../dropdowns/api";
import type { Dropdown } from "../../dropdowns/types";

export interface ColumnEditorProps {
  columns: ColumnDef[];
  onAdd: () => void;
  onUpdate: (
    index: number,
    field: keyof ColumnDef,
    value: string | boolean | number,
  ) => void;
  onRemove: (index: number) => void;
  onMove: (index: number, direction: "up" | "down") => void;
  onDiscard: () => void;
}

/** Check whether a column name collides with the implicit Name pseudo-column. */
function isNameCollision(value: string): boolean {
  return value.trim().toLowerCase() === "name";
}

/**
 * Inline column editing table.
 *
 * Renders a gray, non-editable "Name" pseudo-column at the top of the list
 * (representing the implicit ``Entity.name`` field), followed by user-defined
 * columns with full editing controls.  Adding a column named "Name"
 * (case-insensitive, trimmed) fires an alert and aborts.
 */
function ColumnEditor({
  columns,
  onAdd,
  onUpdate,
  onRemove,
  onMove,
  onDiscard,
}: ColumnEditorProps) {
  const columnTypes = ModRegistry.getInstance().getColumnTypes();
  const textType = columnTypes.get("text");
  const [dropdowns, setDropdowns] = useState<Dropdown[]>([]);

  // ── Fetch dropdowns for the dropdown-column picker ────────────────────
  useEffect(() => {
    listDropdowns()
      .then(setDropdowns)
      .catch(() => setDropdowns([]));
  }, []);

  const handleNameChange = (
    index: number,
    field: keyof ColumnDef,
    value: string,
  ) => {
    if (field === "name" && isNameCollision(value)) {
      alert("Name is already a default column.");
      return;
    }
    onUpdate(index, field, value);
  };

  /** Render a type option with its display name from the registry. */
  const renderTypeOption = (ct: {
    id: string;
    displayName: string;
  }) => (
    <option key={ct.id} value={ct.id}>
      {ct.displayName}
    </option>
  );

  return (
    <div className="column-editor">
      <h3>Columns</h3>
      <div className="column-list">
        {/* ── Implicit Name pseudo-column (gray, non-editable) ── */}
        <div className="column-row column-row--system" data-testid="name-pseudo-column">
          <div className="drag-handles">
            <button
              className="drag-btn"
              disabled
              title="Move up"
              aria-label="Move up"
            >
              ▲
            </button>
            <button
              className="drag-btn"
              disabled
              title="Move down"
              aria-label="Move down"
            >
              ▼
            </button>
          </div>
          <input
            type="text"
            value="Name"
            disabled
            className="col-name col-name--system"
            title="Name is an implicit column on every schema — it cannot be edited or removed."
          />
          <select disabled className="col-type col-type--system">
            <option value="text">
              {textType?.displayName ?? "Text"}
            </option>
          </select>
          <div className="col-required" />
          <div className="col-remove" />
        </div>

        {/* ── User-defined columns ── */}
        {columns.map((col, i) => (
          <div key={i} className="column-row">
            <div className="drag-handles">
              <button
                className="drag-btn"
                disabled={i === 0}
                onClick={() => onMove(i, "up")}
                title="Move up"
              >
                ▲
              </button>
              <button
                className="drag-btn"
                disabled={i === columns.length - 1}
                onClick={() => onMove(i, "down")}
                title="Move down"
              >
                ▼
              </button>
            </div>
            <input
              type="text"
              value={col.name}
              onChange={(e) =>
                handleNameChange(i, "name", e.target.value)
              }
              placeholder="Column name"
              className="col-name"
            />
            <select
              value={col.type}
              onChange={(e) => onUpdate(i, "type", e.target.value)}
              className="col-type"
            >
              {[...columnTypes.values()].map(renderTypeOption)}
            </select>
            {col.type === "dropdown" && (
              <select
                value={col.dropdownId ?? ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  onUpdate(
                    i,
                    "dropdownId",
                    raw ? Number(raw) : "",
                  );
                }}
                className="col-type"
                style={{ minWidth: 120 }}
                title="Dropdown (controlled vocabulary) for this column"
                aria-label="Dropdown"
              >
                <option value="">No dropdown</option>
                {dropdowns.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}
            <label className="col-required">
              <input
                type="checkbox"
                checked={col.required ?? false}
                onChange={(e) => onUpdate(i, "required", e.target.checked)}
              />
              Required
            </label>
            <label className="col-required">
              <input
                type="checkbox"
                checked={col.unique ?? false}
                onChange={(e) => onUpdate(i, "unique", e.target.checked)}
              />
              Unique
            </label>
            <button
              className="col-remove"
              onClick={() => onRemove(i)}
              title="Remove column"
              style={{
                background: "transparent",
                color: "#dc2626",
                border: "none",
                fontSize: "1.2rem",
                padding: "0 0.25rem",
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="column-editor-actions">
        <button onClick={onAdd}>+ Add Column</button>
        <button
          onClick={onDiscard}
          style={{
            background: "transparent",
            color: "var(--gray-700)",
            border: "1px solid var(--gray-300)",
          }}
        >
          Discard Changes
        </button>
      </div>
    </div>
  );
}

export default ColumnEditor;
