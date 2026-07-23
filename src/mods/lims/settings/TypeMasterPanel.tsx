import type { Schema, SchemaTypeItem } from "../types";
import MentionBadge from "../../../shell/src/shared/components/MentionBadge";

export interface TypeMasterPanelProps {
  /** Schemas to display (already filtered per showArchived). */
  schemas: Schema[];
  /** Currently selected schema ID, or null. */
  selectedId: number | null;
  onSelect: (s: Schema) => void;
  showArchived: boolean;
  onToggleArchived: () => void;
  showNew: boolean;
  onToggleNew: () => void;
  newName: string;
  onNewNameChange: (name: string) => void;
  newPrefix: string;
  onNewPrefixChange: (prefix: string) => void;
  newSchemaType: number | null;
  onNewSchemaTypeChange: (id: number) => void;
  schemaTypes: SchemaTypeItem[];
  onCreate: () => void;
  saving: boolean;
  /** Set of schemas with unsaved edits. */
  dirtyEdits: Map<number, Schema>;
}

/**
 * Left-panel schema list with toolbar and inline create form.
 *
 * Pure presentational component — all state and handlers come from the
 * parent SettingsPage orchestrator.
 */
function TypeMasterPanel({
  schemas,
  selectedId,
  onSelect,
  showArchived,
  onToggleArchived,
  showNew,
  onToggleNew,
  newName,
  onNewNameChange,
  newPrefix,
  onNewPrefixChange,
  newSchemaType,
  onNewSchemaTypeChange,
  schemaTypes,
  onCreate,
  saving,
  dirtyEdits,
}: TypeMasterPanelProps) {
  return (
    <div className="settings-master-panel">
      <section className="settings-section">
        <div className="toolbar">
          <h2>Schemas</h2>
          <div className="toolbar-actions">
            <button
              onClick={onToggleArchived}
              className="archive-toggle-btn"
              title={
                showArchived ? "Hide archived items" : "Show archived items"
              }
            >
              {showArchived ? "📦" : "📂"}
            </button>
            <button
              onClick={onToggleNew}
              className="new-schema-btn"
              title="New Schema"
            >
              {showNew ? "Cancel" : "+"}
            </button>
          </div>
        </div>

        {/* New schema form */}
        {showNew && (
          <div className="card new-schema-form">
            <div className="form-row">
              <label>
                Name
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => onNewNameChange(e.target.value)}
                  placeholder="e.g., Blood Sample"
                />
              </label>
              <label>
                Prefix
                <input
                  type="text"
                  value={newPrefix}
                  onChange={(e) => onNewPrefixChange(e.target.value.toUpperCase())}
                  placeholder="e.g., BLOOD"
                  maxLength={20}
                  style={{ width: "120px" }}
                />
              </label>
            </div>
            {schemaTypes.length > 0 && (
              <div className="form-row">
                <label>
                  Schema Type
                  <select
                    value={newSchemaType ?? ""}
                    onChange={(e) =>
                      onNewSchemaTypeChange(Number(e.target.value))
                    }
                  >
                    {schemaTypes.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.display_name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <button
              onClick={onCreate}
              disabled={
                saving ||
                !newName.trim() ||
                !newPrefix.trim() ||
                newSchemaType === null
              }
            >
              {saving ? "Creating…" : "Create"}
            </button>
          </div>
        )}

        {/* Schema list */}
        {schemas.map((s) => (
          <div
            key={s.id}
            className={`card schema-card${!s.is_active ? " is-inactive" : ""}${selectedId === s.id ? " is-selected" : ""}`}
          >
            <div
              className="schema-header"
              onClick={() => onSelect(s)}
            >
              <div className="schema-info">
                <span className="schema-name">{s.name}</span>
                {/* Default schemas get a "System" badge; others show prefix */}
                {s.is_default ? (
                  <span className="system-badge">System</span>
                ) : (
                  <MentionBadge
                    displayId={`${s.prefix}…`}
                    clickable={false}
                  />
                )}
                <span className="schema-meta">
                  {s.columns.length} column
                  {s.columns.length !== 1 ? "s" : ""}
                </span>
                {!s.is_active && (
                  <span className="inactive-tag">Inactive</span>
                )}
                {dirtyEdits.has(s.id) && (
                  <span className="dirty-tag">Edited</span>
                )}
              </div>
            </div>
          </div>
        ))}
        {schemas.length === 0 && (
          <p className="empty">No schemas found.</p>
        )}
      </section>
    </div>
  );
}

export default TypeMasterPanel;
