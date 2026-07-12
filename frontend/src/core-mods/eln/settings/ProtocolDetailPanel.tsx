import type { Protocol, ProtocolItem } from "../types";

export interface ProtocolDetailPanelProps {
  /** The live (server) version of the selected protocol. */
  liveProtocol: Protocol;
  /** The dirty (editing) copy — may differ from liveProtocol. */
  editingProtocol: Protocol;
  /** Whether this protocol has unsaved changes. */
  isDirty: boolean;
  onClose: () => void;
  onDelete: (protocol: Protocol) => void;
  /** Called when the protocol name changes. */
  onNameChange: (name: string) => void;
  /** Item list editors. */
  onAddItem: (type: "step" | "note") => void;
  onUpdateItem: (index: number, field: keyof ProtocolItem, value: string) => void;
  onRemoveItem: (index: number) => void;
  onMoveItem: (index: number, direction: "up" | "down") => void;
  onDiscard: () => void;
}

/**
 * Right-panel detail editor for a single protocol — name field + ordered
 * item list with add/reorder/delete controls.
 *
 * Pure presentational component — all state mutations are delegated to the
 * parent ProtocolSettings orchestrator.
 */
function ProtocolDetailPanel({
  liveProtocol,
  editingProtocol,
  isDirty,
  onClose,
  onDelete,
  onNameChange,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
  onMoveItem,
  onDiscard,
}: ProtocolDetailPanelProps) {
  const items = editingProtocol.items;

  return (
    <div className="settings-detail-panel">
      <div className="card settings-detail-card">
        <div className="detail-header">
          <h2>{liveProtocol.name}</h2>
          <div className="detail-header-actions">
            {liveProtocol.is_active && (
              <button
                className="deactivate-btn"
                onClick={() => onDelete(liveProtocol)}
                title="Deactivate protocol"
              >
                🗑️
              </button>
            )}
            <button className="type-detail-close" onClick={onClose}>
              ×
            </button>
          </div>
        </div>

        <div className="detail-body">
          <div className="detail-field">
            <span className="detail-label">Status</span>
            <span>{liveProtocol.is_active ? "Active" : "Inactive"}</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">Items</span>
            <span>{items.length}</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">Updated</span>
            <span>{new Date(liveProtocol.updated_at).toLocaleDateString()}</span>
          </div>
        </div>

        {/* Protocol name editor */}
        <div className="detail-field" style={{ marginTop: "1rem" }}>
          <span className="detail-label">Name</span>
          <input
            type="text"
            value={editingProtocol.name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Protocol name"
            style={{ width: "100%" }}
          />
        </div>

        {/* Item list editor */}
        <div className="column-editor" style={{ marginTop: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <h3 style={{ margin: 0 }}>Items</h3>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                className="btn-ghost"
                onClick={() => onAddItem("step")}
                title="Add a checkable step"
              >
                + Step
              </button>
              <button
                className="btn-ghost"
                onClick={() => onAddItem("note")}
                title="Add a non-checkable note"
              >
                + Note
              </button>
            </div>
          </div>

          {items.length === 0 && (
            <p className="empty">No items yet. Add a step or note to get started.</p>
          )}

          <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {items.map((item, i) => (
              <li
                key={i}
                className="card"
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.5rem",
                  padding: "0.5rem",
                  marginBottom: "0.25rem",
                }}
              >
                {/* Type badge */}
                <span
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    padding: "0.1rem 0.4rem",
                    borderRadius: "3px",
                    backgroundColor:
                      item.type === "step"
                        ? "var(--color-accent, #3b82f6)"
                        : "var(--color-muted, #6b7280)",
                    color: "white",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    marginTop: "0.35rem",
                  }}
                >
                  {item.type}
                </span>

                {/* Text input */}
                <input
                  type="text"
                  value={item.text}
                  onChange={(e) => onUpdateItem(i, "text", e.target.value)}
                  placeholder={item.type === "step" ? "Step description…" : "Note text…"}
                  style={{ flex: 1, minWidth: 0 }}
                />

                {/* Reorder + delete controls */}
                <div style={{ display: "flex", gap: "0.15rem", flexShrink: 0 }}>
                  <button
                    className="btn-icon"
                    onClick={() => onMoveItem(i, "up")}
                    disabled={i === 0}
                    title="Move up"
                    style={{ padding: "0.15rem 0.3rem", fontSize: "0.8rem" }}
                  >
                    ↑
                  </button>
                  <button
                    className="btn-icon"
                    onClick={() => onMoveItem(i, "down")}
                    disabled={i === items.length - 1}
                    title="Move down"
                    style={{ padding: "0.15rem 0.3rem", fontSize: "0.8rem" }}
                  >
                    ↓
                  </button>
                  <button
                    className="btn-icon"
                    onClick={() => onRemoveItem(i)}
                    title="Remove item"
                    style={{ padding: "0.15rem 0.3rem", fontSize: "0.8rem", color: "var(--color-danger, #ef4444)" }}
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ol>

          {/* Discard button */}
          {isDirty && (
            <div style={{ marginTop: "0.75rem" }}>
              <button className="btn-ghost" onClick={onDiscard}>
                Discard changes
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProtocolDetailPanel;
