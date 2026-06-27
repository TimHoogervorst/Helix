import type { ColumnDef } from "../../types/lims";

const ALLOWED_TYPES = ["Text", "Number", "Date", "Boolean", "Reference"];

export interface ColumnEditorProps {
  columns: ColumnDef[];
  onAdd: () => void;
  onUpdate: (
    index: number,
    field: keyof ColumnDef,
    value: string | boolean,
  ) => void;
  onRemove: (index: number) => void;
  onMove: (index: number, direction: "up" | "down") => void;
  onDiscard: () => void;
}

/**
 * Inline column editing table.
 *
 * Renders a list of column definitions with controls for name, type,
 * required flag, ordering, and removal.  All mutations are callbacks
 * owned by the parent orchestrator.
 */
function ColumnEditor({
  columns,
  onAdd,
  onUpdate,
  onRemove,
  onMove,
  onDiscard,
}: ColumnEditorProps) {
  return (
    <div className="column-editor">
      <h3>Columns</h3>
      <div className="column-list">
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
              onChange={(e) => onUpdate(i, "name", e.target.value)}
              placeholder="Column name"
              className="col-name"
            />
            <select
              value={col.type}
              onChange={(e) => onUpdate(i, "type", e.target.value)}
              className="col-type"
            >
              {ALLOWED_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <label className="col-required">
              <input
                type="checkbox"
                checked={col.required ?? false}
                onChange={(e) => onUpdate(i, "required", e.target.checked)}
              />
              Required
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
