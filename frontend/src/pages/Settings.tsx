import { useState, useEffect, useCallback } from "react";
import { get, post, put, del } from "../api/client";
import type { EntityType, EntityTypePayload, ColumnDef } from "../types/lims";
import ReferenceBadge from "../components/ReferenceBadge";

const ALLOWED_TYPES = ["Text", "Number", "Date", "Boolean", "Reference"];

const CURATED_EMOJIS = ["🧪", "🩸", "🐁", "🌿", "👤", "🧬", "🔬"];

function Settings() {
  const [entityTypes, setEntityTypes] = useState<EntityType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dirtyEdits, setDirtyEdits] = useState<Map<number, EntityType>>(new Map());
  const [saving, setSaving] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [emojiPopover, setEmojiPopover] = useState<{
    id: number;
    source: "header" | "body";
  } | null>(null);

  // New schema form
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPrefix, setNewPrefix] = useState("");

  // Danger zone
  const [dangerLoading, setDangerLoading] = useState<string | null>(null);
  const [dangerResult, setDangerResult] = useState<string | null>(null);

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

  // ── Delete (soft / deactivate) ──
  const handleDelete = async (et: EntityType) => {
    if (!window.confirm(`Deactivate schema "${et.name}"?`)) return;
    try {
      await del(`/lims/entity-types/${et.id}/`);
      setDirtyEdits((prev) => {
        const next = new Map(prev);
        next.delete(et.id);
        return next;
      });
      if (selectedId === et.id) setSelectedId(null);
      await fetchTypes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  // ── Select a schema → open in detail panel & start editing ──
  const handleSelect = (et: EntityType) => {
    if (selectedId === et.id) {
      setSelectedId(null);
    } else {
      setSelectedId(et.id);
      setDirtyEdits((prev) => {
        if (prev.has(et.id)) return prev;
        const next = new Map(prev);
        next.set(et.id, {
          ...et,
          icon: et.icon || "🧪",
          columns: et.columns.map((c) => ({ ...c })),
        });
        return next;
      });
    }
  };

  // ── Column editing helpers (operate on dirty copy) ──

  const addColumn = (id: number) => {
    setDirtyEdits((prev) => {
      const next = new Map(prev);
      const et = next.get(id);
      if (!et) return prev;
      next.set(id, {
        ...et,
        columns: [...et.columns, { name: "", type: "Text" as const }],
      });
      return next;
    });
  };

  const updateColumn = (
    id: number,
    index: number,
    field: keyof ColumnDef,
    value: string | boolean,
  ) => {
    setDirtyEdits((prev) => {
      const next = new Map(prev);
      const et = next.get(id);
      if (!et) return prev;
      const cols = [...et.columns];
      cols[index] = { ...cols[index], [field]: value };
      next.set(id, { ...et, columns: cols });
      return next;
    });
  };

  const removeColumn = (id: number, index: number) => {
    setDirtyEdits((prev) => {
      const next = new Map(prev);
      const et = next.get(id);
      if (!et) return prev;
      next.set(id, {
        ...et,
        columns: et.columns.filter((_, i) => i !== index),
      });
      return next;
    });
  };

  const moveColumn = (id: number, index: number, direction: "up" | "down") => {
    setDirtyEdits((prev) => {
      const next = new Map(prev);
      const et = next.get(id);
      if (!et) return prev;
      const cols = [...et.columns];
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= cols.length) return prev;
      [cols[index], cols[target]] = [cols[target], cols[index]];
      next.set(id, { ...et, columns: cols });
      return next;
    });
  };

  const setEntityTypeEmoji = (id: number, emoji: string) => {
    setDirtyEdits((prev) => {
      const next = new Map(prev);
      const et = next.get(id);
      if (!et) return prev;
      next.set(id, { ...et, icon: emoji });
      return next;
    });
    setEmojiPopover(null);
  };

  // ── Save all dirty schemas ──
  const saveAllChanges = async () => {
    if (dirtyEdits.size === 0) return;
    setSaving(true);
    setError(null);
    let failed = 0;
    for (const [, et] of dirtyEdits) {
      try {
        const payload: EntityTypePayload = {
          name: et.name,
          prefix: et.prefix,
          icon: et.icon,
          columns: et.columns,
        };
        await put(`/lims/entity-types/${et.id}/`, payload);
      } catch {
        failed++;
      }
    }
    setDirtyEdits(new Map());
    await fetchTypes();
    if (failed > 0) {
      setError(`Failed to save ${failed} schema${failed > 1 ? "s" : ""}`);
    }
    setSaving(false);
  };

  // ── Discard edits for one schema ──
  const discardEdits = (id: number) => {
    setDirtyEdits((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };

  // ── Danger Zone handlers ──

  const handleDeleteAllElms = async () => {
    if (!window.confirm("DELETE ALL ELNs? This will permanently delete every notebook entry. This cannot be undone.")) return;
    setDangerLoading("elns");
    setDangerResult(null);
    try {
      await del("/eln/entries/delete_all/");
      setDangerResult("All ELN entries deleted.");
    } catch (err) {
      setDangerResult(`Failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setDangerLoading(null);
    }
  };

  const handleDeleteAllEntities = async () => {
    if (!window.confirm("DELETE ALL ENTITIES? This will permanently delete every LIMS entity. This cannot be undone.")) return;
    setDangerLoading("entities");
    setDangerResult(null);
    try {
      await del("/lims/entities/delete_all/");
      setDangerResult("All entities deleted.");
    } catch (err) {
      setDangerResult(`Failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setDangerLoading(null);
    }
  };

  const handleDeleteEverything = async () => {
    if (!window.confirm("DELETE EVERYTHING? This will permanently delete all ELN entries, entities, and schemas. This cannot be undone.")) return;
    setDangerLoading("everything");
    setDangerResult(null);
    try {
      await del("/delete-everything/");
      setDangerResult("Everything deleted — all ELN entries, entities, and schemas cleared.");
      await fetchTypes();
    } catch (err) {
      setDangerResult(`Failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setDangerLoading(null);
    }
  };

  if (loading) return <p className="empty">Loading…</p>;

  const selectedEntity = selectedId
    ? entityTypes.find((et) => et.id === selectedId) ?? null
    : null;
  const editingEntity = selectedId ? dirtyEdits.get(selectedId) : undefined;
  const visibleTypes = showArchived
    ? entityTypes
    : entityTypes.filter((et) => et.is_active);
  const dirtyCount = dirtyEdits.size;

  return (
    <div className={`page settings-page${selectedEntity ? " has-detail" : ""}`}>
      {error && <div className="error">{error}</div>}

      {/* Save button bar */}
      <div className="save-bar">
        <button
          className="save-all-btn"
          onClick={saveAllChanges}
          disabled={saving || dirtyCount === 0}
        >
          {saving ? "Saving…" : `Save Changes (${dirtyCount})`}
        </button>
      </div>

      {/* Master–Detail Layout */}
      <div
        className={`settings-master-detail ${selectedEntity ? "has-detail" : ""}`}
      >
        {/* Left Panel: Schema List */}
        <div className="settings-master-panel">
          <section className="settings-section">
            <div className="toolbar">
              <h2>Schemas</h2>
              <div className="toolbar-actions">
                <button
                  onClick={() => setShowArchived(!showArchived)}
                  className="archive-toggle-btn"
                  title={
                    showArchived
                      ? "Hide archived items"
                      : "Show archived items"
                  }
                >
                  {showArchived ? "📦" : "📂"}
                </button>
                <button
                  onClick={() => setShowNew(!showNew)}
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
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="e.g., Blood Sample"
                    />
                  </label>
                  <label>
                    Prefix
                    <input
                      type="text"
                      value={newPrefix}
                      onChange={(e) =>
                        setNewPrefix(e.target.value.toUpperCase())
                      }
                      placeholder="e.g., BLOOD"
                      maxLength={20}
                      style={{ width: "120px" }}
                    />
                  </label>
                </div>
                <button
                  onClick={handleCreate}
                  disabled={
                    saving || !newName.trim() || !newPrefix.trim()
                  }
                >
                  {saving ? "Creating…" : "Create"}
                </button>
              </div>
            )}

            {/* Schema list */}
            {visibleTypes.map((et) => (
              <div
                key={et.id}
                className={`card schema-card${!et.is_active ? " is-inactive" : ""}${selectedId === et.id ? " is-selected" : ""}`}
              >
                <div
                  className="schema-header"
                  onClick={() => handleSelect(et)}
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
            {visibleTypes.length === 0 && (
              <p className="empty">No schemas found.</p>
            )}
          </section>
        </div>

        {/* Right Panel: Detail / Column Editor */}
        {selectedEntity && editingEntity && (
          <div className="settings-detail-panel">
            <div className="card settings-detail-card">
              <div className="detail-header">
                <h2>
                  <ReferenceBadge
                    displayId={`${editingEntity.prefix}…`}
                    clickable={false}
                  />
                  <span style={{ position: "relative", cursor: "pointer", userSelect: "none" }}>
                    <span
                      onClick={() =>
                        setEmojiPopover((prev) =>
                          prev?.id === selectedEntity.id && prev?.source === "header"
                            ? null
                            : { id: selectedEntity.id, source: "header" }
                        )
                      }
                      style={{ fontSize: "1.2rem" }}
                      title="Change icon"
                    >
                      {editingEntity.icon || "🧪"}
                    </span>
                    {emojiPopover?.id === selectedEntity.id &&
                      emojiPopover?.source === "header" && (
                      <span
                        className="settings-emoji-popover"
                        onMouseLeave={() => setEmojiPopover(null)}
                      >
                        {CURATED_EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            className={`settings-emoji-option${editingEntity.icon === emoji ? " is-selected" : ""}`}
                            onClick={() => setEntityTypeEmoji(selectedEntity.id, emoji)}
                            title={`Set icon to ${emoji}`}
                          >
                            {emoji}
                          </button>
                        ))}
                      </span>
                    )}
                  </span>
                  {selectedEntity.name}
                </h2>
                <div className="detail-header-actions">
                  {selectedEntity.is_active && (
                    <button
                      className="deactivate-btn"
                      onClick={() => handleDelete(selectedEntity)}
                      title="Deactivate schema"
                    >
                      🗑️
                    </button>
                  )}
                  <button
                    className="lims-detail-close"
                    onClick={() => setSelectedId(null)}
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="detail-body">
                <div className="detail-field">
                  <span className="detail-label">Status</span>
                  <span>
                    {selectedEntity.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">Prefix</span>
                  <ReferenceBadge
                    displayId={`${editingEntity.prefix}…`}
                    clickable={false}
                  />
                </div>
                <div className="detail-field">
                  <span className="detail-label">Icon</span>
                  <span style={{ position: "relative", cursor: "pointer", userSelect: "none", display: "inline-block" }}>
                    <span
                      onClick={() =>
                        setEmojiPopover((prev) =>
                          prev?.id === selectedEntity.id && prev?.source === "body"
                            ? null
                            : { id: selectedEntity.id, source: "body" }
                        )
                      }
                      style={{ fontSize: "1.2rem" }}
                      title="Change icon"
                    >
                      {editingEntity.icon || "🧪"}
                    </span>
                    {emojiPopover?.id === selectedEntity.id &&
                      emojiPopover?.source === "body" && (
                      <span
                        className="settings-emoji-popover"
                        onMouseLeave={() => setEmojiPopover(null)}
                      >
                        {CURATED_EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            className={`settings-emoji-option${editingEntity.icon === emoji ? " is-selected" : ""}`}
                            onClick={() => setEntityTypeEmoji(selectedEntity.id, emoji)}
                            title={`Set icon to ${emoji}`}
                          >
                            {emoji}
                          </button>
                        ))}
                      </span>
                    )}
                  </span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">Columns</span>
                  <span>{editingEntity.columns.length}</span>
                </div>
              </div>

              {/* Inline Column Editor */}
              <div className="column-editor">
                <h3>Columns</h3>
                <div className="column-list">
                  {editingEntity.columns.map((col, i) => (
                    <div key={i} className="column-row">
                      <div className="drag-handles">
                        <button
                          className="drag-btn"
                          disabled={i === 0}
                          onClick={() =>
                            moveColumn(selectedEntity.id, i, "up")
                          }
                          title="Move up"
                        >
                          ▲
                        </button>
                        <button
                          className="drag-btn"
                          disabled={
                            i === editingEntity.columns.length - 1
                          }
                          onClick={() =>
                            moveColumn(selectedEntity.id, i, "down")
                          }
                          title="Move down"
                        >
                          ▼
                        </button>
                      </div>
                      <input
                        type="text"
                        value={col.name}
                        onChange={(e) =>
                          updateColumn(
                            selectedEntity.id,
                            i,
                            "name",
                            e.target.value,
                          )
                        }
                        placeholder="Column name"
                        className="col-name"
                      />
                      <select
                        value={col.type}
                        onChange={(e) =>
                          updateColumn(
                            selectedEntity.id,
                            i,
                            "type",
                            e.target.value,
                          )
                        }
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
                          onChange={(e) =>
                            updateColumn(
                              selectedEntity.id,
                              i,
                              "required",
                              e.target.checked,
                            )
                          }
                        />
                        Required
                      </label>
                      <button
                        className="col-remove"
                        onClick={() =>
                          removeColumn(selectedEntity.id, i)
                        }
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
                  <button onClick={() => addColumn(selectedEntity.id)}>
                    + Add Column
                  </button>
                  <button
                    onClick={() => discardEdits(selectedEntity.id)}
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
            </div>
          </div>
        )}
      </div>

      {/* Danger Zone */}
      <section className="settings-danger-zone">
        <h2>⚠️ Danger Zone</h2>
        <p className="danger-zone-desc">
          These actions are destructive and cannot be undone. For testing use only.
        </p>

        {dangerResult && (
          <div className={dangerResult.startsWith("Failed") ? "error" : "danger-success"}>
            {dangerResult}
          </div>
        )}

        <div className="danger-zone-actions">
          <button
            className="danger-btn danger-btn-elns"
            onClick={handleDeleteAllElms}
            disabled={dangerLoading !== null}
          >
            {dangerLoading === "elns" ? "Deleting…" : "🗑️ DELETE ALL ELNs"}
          </button>
          <button
            className="danger-btn danger-btn-entities"
            onClick={handleDeleteAllEntities}
            disabled={dangerLoading !== null}
          >
            {dangerLoading === "entities" ? "Deleting…" : "🗑️ DELETE ALL ENTITIES"}
          </button>
          <button
            className="danger-btn danger-btn-everything"
            onClick={handleDeleteEverything}
            disabled={dangerLoading !== null}
          >
            {dangerLoading === "everything" ? "Deleting…" : "💀 DELETE EVERYTHING"}
          </button>
        </div>
      </section>
    </div>
  );
}

export default Settings;
