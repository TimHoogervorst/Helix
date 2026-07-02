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

  return (
    <div className="column-editor">
      <h3>Columns</h3>
      <div className="column-list">
        {/* ── Implicit Name pseudo-column (gray, non-editable) ── */}
        <div className="column-row column-row--system" data-testid="name-pseudo-column">
          <div className="drag-handles" />
          <input
            type="text"
            value="Name"
            disabled
            className="col-name col-name--system"
            title="Name is an implicit column on every schema — it cannot be edited or removed."
          />
          <select disabled className="col-type col-type--system">
            <option>Text</option>
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
