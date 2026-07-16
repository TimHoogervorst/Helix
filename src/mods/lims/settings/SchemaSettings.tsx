import { useState, useEffect, useCallback } from "react";
import { get, post, put, del } from "../../../core/api/client";
import type { EntityType, EntityTypePayload, ColumnDef } from "../types";
import TypeMasterPanel from "./TypeMasterPanel";
import TypeDetailPanel from "./TypeDetailPanel";
import DangerZone from "./DangerZone";

function SettingsPage() {
  const [entityTypes, setEntityTypes] = useState<EntityType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dirtyEdits, setDirtyEdits] = useState<Map<number, EntityType>>(
    new Map(),
  );
  const [saving, setSaving] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
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

  useEffect(() => {
    fetchTypes();
  }, [fetchTypes]);

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
    if (
      !window.confirm(
        "DELETE ALL ELNs? This will permanently delete every notebook entry. This cannot be undone.",
      )
    )
      return;
    setDangerLoading("elns");
    setDangerResult(null);
    try {
      await del("/eln/entries/delete_all/");
      setDangerResult("All ELN entries deleted.");
    } catch (err) {
      setDangerResult(
        `Failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      setDangerLoading(null);
    }
  };

  const handleDeleteAllEntities = async () => {
    if (
      !window.confirm(
        "DELETE ALL ENTITIES? This will permanently delete every LIMS entity. This cannot be undone.",
      )
    )
      return;
    setDangerLoading("entities");
    setDangerResult(null);
    try {
      await del("/lims/entities/delete_all/");
      setDangerResult("All entities deleted.");
    } catch (err) {
      setDangerResult(
        `Failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      setDangerLoading(null);
    }
  };

  const handleDeleteEverything = async () => {
    if (
      !window.confirm(
        "DELETE EVERYTHING? This will permanently delete all ELN entries, entities, and schemas. This cannot be undone.",
      )
    )
      return;
    setDangerLoading("everything");
    setDangerResult(null);
    try {
      await del("/delete-everything/");
      setDangerResult(
        "Everything deleted — all ELN entries, entities, and schemas cleared.",
      );
      await fetchTypes();
    } catch (err) {
      setDangerResult(
        `Failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      setDangerLoading(null);
    }
  };

  if (loading) return <p className="empty">Loading…</p>;

  const selectedEntity = selectedId
    ? entityTypes.find((et) => et.id === selectedId) ?? null
    : null;
  const editingEntity = selectedId
    ? dirtyEdits.get(selectedId)
    : undefined;
  const visibleTypes = showArchived
    ? entityTypes
    : entityTypes.filter((et) => et.is_active);
  const dirtyCount = dirtyEdits.size;

  return (
    <div
      className={`page settings-page${selectedEntity ? " has-detail" : ""}`}
    >
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
        <TypeMasterPanel
          types={visibleTypes}
          selectedId={selectedId}
          onSelect={handleSelect}
          showArchived={showArchived}
          onToggleArchived={() => setShowArchived(!showArchived)}
          showNew={showNew}
          onToggleNew={() => setShowNew(!showNew)}
          newName={newName}
          onNewNameChange={setNewName}
          newPrefix={newPrefix}
          onNewPrefixChange={setNewPrefix}
          onCreate={handleCreate}
          saving={saving}
          dirtyEdits={dirtyEdits}
        />

        {selectedEntity && editingEntity && (
          <TypeDetailPanel
            liveEntity={selectedEntity}
            editingEntity={editingEntity}
            isDirty={dirtyEdits.has(selectedEntity.id)}
            onClose={() => setSelectedId(null)}
            onDeactivate={handleDelete}
            onSetEmoji={(emoji) =>
              setEntityTypeEmoji(selectedEntity.id, emoji)
            }
            columnProps={{
              columns: editingEntity.columns,
              onAdd: () => addColumn(selectedEntity.id),
              onUpdate: (i, field, value) =>
                updateColumn(selectedEntity.id, i, field, value),
              onRemove: (i) => removeColumn(selectedEntity.id, i),
              onMove: (i, dir) => moveColumn(selectedEntity.id, i, dir),
              onDiscard: () => discardEdits(selectedEntity.id),
            }}
          />
        )}
      </div>

      <DangerZone
        dangerLoading={dangerLoading}
        dangerResult={dangerResult}
        onDeleteAllElms={handleDeleteAllElms}
        onDeleteAllEntities={handleDeleteAllEntities}
        onDeleteEverything={handleDeleteEverything}
      />
    </div>
  );
}

export default SettingsPage;
