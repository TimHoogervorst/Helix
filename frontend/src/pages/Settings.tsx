import { useState, useEffect, useCallback } from "react";
import { get, post, put, del } from "../api/client";
import type { EntityType, EntityTypePayload, ColumnDef } from "../types/lims";

const ALLOWED_TYPES = ["Text", "Number", "Date", "Boolean", "Reference"];

function Settings() {
  const [entityTypes, setEntityTypes] = useState<EntityType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<EntityType | null>(null);
  const [saving, setSaving] = useState(false);

  // New schema form
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPrefix, setNewPrefix] = useState("");

  const fetchTypes = useCallback(async () => {
    try {
      const data = await get<EntityType[]>("/lims/entity-types/");
      setEntityTypes(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTypes(); }, [fetchTypes]);

  // ── Create ──
  const handleCreate = async () => {
    if (!newName.trim() || !newPrefix.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload: EntityTypePayload = {
        name: newName.trim(),
        prefix: newPrefix.trim().toUpperCase(),
        columns: [],
      };
      await post("/lims/entity-types/", payload);
      setShowNew(false);
      setNewName("");
      setNewPrefix("");
      await fetchTypes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setSaving(false);
    }
  };

  // ── Delete (soft) ──
  const handleDelete = async (et: EntityType) => {
    if (!window.confirm(`Deactivate schema "${et.name}"?`)) return;
    try {
      await del(`/lims/entity-types/${et.id}/`);
      await fetchTypes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  // ── Edit columns ──
  const startEditing = (et: EntityType) => {
    setEditing({ ...et, columns: [...et.columns] });
    setExpandedId(et.id);
  };

  const addColumn = () => {
    if (!editing) return;
    setEditing({
      ...editing,
      columns: [...editing.columns, { name: "", type: "Text" as const }],
    });
  };

  const updateColumn = (index: number, field: keyof ColumnDef, value: string | boolean) => {
    if (!editing) return;
    const cols = [...editing.columns];
    cols[index] = { ...cols[index], [field]: value };
    setEditing({ ...editing, columns: cols });
  };

  const removeColumn = (index: number) => {
    if (!editing) return;
    const cols = editing.columns.filter((_, i) => i !== index);
    setEditing({ ...editing, columns: cols });
  };

  const moveColumn = (index: number, direction: "up" | "down") => {
    if (!editing) return;
    const cols = [...editing.columns];
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= cols.length) return;
    [cols[index], cols[target]] = [cols[target], cols[index]];
    setEditing({ ...editing, columns: cols });
  };

  const saveEditing = async () => {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      const payload: EntityTypePayload = {
        name: editing.name,
        prefix: editing.prefix,
        columns: editing.columns,
      };
      await put(`/lims/entity-types/${editing.id}/`, payload);
      setEditing(null);
      setExpandedId(null);
      await fetchTypes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="empty">Loading…</p>;

  return (
    <div className="page">
      <div className="toolbar">
        <h1>Settings</h1>
      </div>

      {error && <div className="error">{error}</div>}

      <section className="settings-section">
        <div className="toolbar">
          <h2>Schemas</h2>
          <button onClick={() => setShowNew(!showNew)}>
            {showNew ? "Cancel" : "New Schema"}
          </button>
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
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g., Blood Sample"
                />
              </label>
              <label>
                Prefix
                <input
                  type="text"
                  value={newPrefix}
                  onChange={(e) => setNewPrefix(e.target.value.toUpperCase())}
                  placeholder="e.g., BLOOD"
                  maxLength={20}
                  style={{ width: "120px" }}
                />
              </label>
            </div>
            <button onClick={handleCreate} disabled={saving || !newName.trim() || !newPrefix.trim()}>
              {saving ? "Creating…" : "Create"}
            </button>
          </div>
        )}

        {/* Schema list */}
        {entityTypes.map((et) => (
          <div key={et.id} className={`card schema-card ${!et.is_active ? "is-inactive" : ""}`}>
            <div
              className="schema-header"
              onClick={() => setExpandedId(expandedId === et.id ? null : et.id)}
            >
              <div className="schema-info">
                <span className="schema-name">{et.name}</span>
                <span className="eln-badge">{et.prefix}</span>
                <span className="schema-meta">
                  {et.columns.length} column{et.columns.length !== 1 ? "s" : ""}
                </span>
                {!et.is_active && <span className="inactive-tag">Inactive</span>}
              </div>
              <div className="schema-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => startEditing(et)}
                  style={{
                    background: "transparent",
                    color: "var(--gray-700)",
                    border: "1px solid var(--gray-300)",
                  }}
                >
                  Edit
                </button>
                {et.is_active && (
                  <button
                    onClick={() => handleDelete(et)}
                    style={{
                      background: "transparent",
                      color: "#dc2626",
                      border: "1px solid #fecaca",
                    }}
                  >
                    Deactivate
                  </button>
                )}
              </div>
            </div>

            {/* Expanded column editor */}
            {expandedId === et.id && editing && editing.id === et.id && (
              <div className="column-editor">
                <div className="column-list">
                  {editing.columns.map((col, i) => (
                    <div key={i} className="column-row">
                      <div className="drag-handles">
                        <button
                          className="drag-btn"
                          disabled={i === 0}
                          onClick={() => moveColumn(i, "up")}
                          title="Move up"
                        >
                          ▲
                        </button>
                        <button
                          className="drag-btn"
                          disabled={i === editing.columns.length - 1}
                          onClick={() => moveColumn(i, "down")}
                          title="Move down"
                        >
                          ▼
                        </button>
                      </div>
                      <input
                        type="text"
                        value={col.name}
                        onChange={(e) => updateColumn(i, "name", e.target.value)}
                        placeholder="Column name"
                        className="col-name"
                      />
                      <select
                        value={col.type}
                        onChange={(e) => updateColumn(i, "type", e.target.value)}
                        className="col-type"
                      >
                        {ALLOWED_TYPES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <label className="col-required">
                        <input
                          type="checkbox"
                          checked={col.required ?? false}
                          onChange={(e) => updateColumn(i, "required", e.target.checked)}
                        />
                        Required
                      </label>
                      <button
                        className="col-remove"
                        onClick={() => removeColumn(i)}
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
                  <button onClick={addColumn}>+ Add Column</button>
                  <button onClick={saveEditing} disabled={saving}>
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button
                    onClick={() => { setEditing(null); setExpandedId(null); }}
                    style={{
                      background: "transparent",
                      color: "var(--gray-700)",
                      border: "1px solid var(--gray-300)",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}

export default Settings;
