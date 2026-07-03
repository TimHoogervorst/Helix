import type { EntityType } from "../types";
import ReferenceBadge from "../../../shared/ReferenceBadge";

export interface TypeMasterPanelProps {
  /** Entity types to display (already filtered per showArchived). */
  types: EntityType[];
  /** Currently selected type ID, or null. */
  selectedId: number | null;
  onSelect: (et: EntityType) => void;
  showArchived: boolean;
  onToggleArchived: () => void;
  showNew: boolean;
  onToggleNew: () => void;
  newName: string;
  onNewNameChange: (name: string) => void;
  newPrefix: string;
  onNewPrefixChange: (prefix: string) => void;
  onCreate: () => void;
  saving: boolean;
  /** Set of entity types with unsaved edits. */
  dirtyEdits: Map<number, EntityType>;
}

/**
 * Left-panel schema list with toolbar and inline create form.
 *
 * Pure presentational component — all state and handlers come from the
 * parent SettingsPage orchestrator.
 */
function TypeMasterPanel({
  types,
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
            <button
              onClick={onCreate}
              disabled={saving || !newName.trim() || !newPrefix.trim()}
            >
              {saving ? "Creating…" : "Create"}
            </button>
          </div>
        )}

        {/* Schema list */}
        {types.map((et) => (
          <div
            key={et.id}
            className={`card schema-card${!et.is_active ? " is-inactive" : ""}${selectedId === et.id ? " is-selected" : ""}`}
          >
            <div
              className="schema-header"
              onClick={() => onSelect(et)}
            >
              <div className="schema-info">
                <span className="schema-name">{et.name}</span>
                <ReferenceBadge
                  displayId={`${et.prefix}…`}
                  clickable={false}
                />
                <span className="schema-meta">
                  {et.columns.length} column
                  {et.columns.length !== 1 ? "s" : ""}
                </span>
                {!et.is_active && (
                  <span className="inactive-tag">Inactive</span>
                )}
                {dirtyEdits.has(et.id) && (
                  <span className="dirty-tag">Edited</span>
                )}
              </div>
            </div>
          </div>
        ))}
        {types.length === 0 && (
          <p className="empty">No schemas found.</p>
        )}
      </section>
    </div>
  );
}

export default TypeMasterPanel;
