import type { Protocol } from "../types";

export interface ProtocolMasterPanelProps {
  /** Protocols to display (active only). */
  protocols: Protocol[];
  /** Currently selected protocol ID, or null. */
  selectedId: number | null;
  onSelect: (protocol: Protocol) => void;
  showNew: boolean;
  onToggleNew: () => void;
  newName: string;
  onNewNameChange: (name: string) => void;
  onCreate: () => void;
  saving: boolean;
  /** Set of protocol IDs with unsaved edits. */
  dirtyIds: Set<number>;
}

/**
 * Left-panel protocol list with toolbar and inline create form.
 *
 * Pure presentational component — all state and handlers come from the
 * parent ProtocolSettings orchestrator.
 */
function ProtocolMasterPanel({
  protocols,
  selectedId,
  onSelect,
  showNew,
  onToggleNew,
  newName,
  onNewNameChange,
  onCreate,
  saving,
  dirtyIds,
}: ProtocolMasterPanelProps) {
  const itemCount = (p: Protocol) => p.items.length;

  return (
    <div className="settings-master-panel">
      <section className="settings-section">
        <div className="toolbar">
          <h2>Protocols</h2>
          <div className="toolbar-actions">
            <button
              onClick={onToggleNew}
              className="new-schema-btn"
              title="New Protocol"
            >
              {showNew ? "Cancel" : "+"}
            </button>
          </div>
        </div>

        {/* New protocol form */}
        {showNew && (
          <div className="card new-schema-form">
            <div className="form-row">
              <label>
                Name
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => onNewNameChange(e.target.value)}
                  placeholder="e.g., CRISPR RNP Transfection"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onCreate();
                  }}
                />
              </label>
            </div>
            <button
              onClick={onCreate}
              disabled={saving || !newName.trim()}
            >
              {saving ? "Creating…" : "Create"}
            </button>
          </div>
        )}

        {/* Protocol list */}
        {protocols.map((p) => (
          <div
            key={p.id}
            className={`card schema-card${!p.is_active ? " is-inactive" : ""}${selectedId === p.id ? " is-selected" : ""}`}
          >
            <div
              className="schema-header"
              onClick={() => onSelect(p)}
            >
              <div className="schema-info">
                <span className="schema-name">{p.name}</span>
                <span className="schema-meta">
                  {itemCount(p)} item{itemCount(p) !== 1 ? "s" : ""}
                </span>
                {!p.is_active && (
                  <span className="inactive-tag">Inactive</span>
                )}
                {dirtyIds.has(p.id) && (
                  <span className="dirty-tag">Edited</span>
                )}
              </div>
            </div>
          </div>
        ))}
        {protocols.length === 0 && (
          <p className="empty">No protocols found.</p>
        )}
      </section>
    </div>
  );
}

export default ProtocolMasterPanel;
