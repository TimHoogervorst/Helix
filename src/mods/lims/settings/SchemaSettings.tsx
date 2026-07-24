import { useState, useEffect, useCallback } from "react";
import { get, post, put, patch, del } from "../../../shell/src/api/client";
import type { Schema, SchemaPayload, SchemaTypeItem, ColumnDef } from "../types";
import TypeMasterPanel from "./TypeMasterPanel";
import TypeDetailPanel from "./TypeDetailPanel";
import DangerZone from "./DangerZone";

function SettingsPage() {
  const [schemas, setSchemas] = useState<Schema[]>([]);
  const [schemaTypes, setSchemaTypes] = useState<SchemaTypeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dirtyEdits, setDirtyEdits] = useState<Map<number, Schema>>(
    new Map(),
  );
  const [saving, setSaving] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPrefix, setNewPrefix] = useState("");
  const [newSchemaType, setNewSchemaType] = useState<number | null>(null);

  // Danger zone
  const [dangerLoading, setDangerLoading] = useState<string | null>(null);
  const [dangerResult, setDangerResult] = useState<string | null>(null);

  const fetchSchemas = useCallback(async () => {
    try {
      const data = await get<Schema[]>("/schemas/");
      setSchemas(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSchemaTypes = useCallback(async () => {
    try {
      const data = await get<SchemaTypeItem[]>("/schema-types/");
      setSchemaTypes(data);
      // Default to first schema type if available
      if (data.length > 0 && newSchemaType === null) {
        setNewSchemaType(data[0].id);
      }
    } catch {
      // Schema types are optional for display — don't block on failure
    }
  }, []);

  useEffect(() => {
    fetchSchemas();
    fetchSchemaTypes();
  }, [fetchSchemas, fetchSchemaTypes]);

  // ── Create ──
  const handleCreate = async () => {
    if (!newName.trim() || !newPrefix.trim() || newSchemaType === null) return;
    setSaving(true);
    setError(null);
    try {
      const payload: SchemaPayload = {
        name: newName.trim(),
        prefix: newPrefix.trim().toUpperCase(),
        schema_type: newSchemaType,
        columns: [],
      };
      await post("/schemas/", payload);
      setShowNew(false);
      setNewName("");
      setNewPrefix("");
      await fetchSchemas();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setSaving(false);
    }
  };

  // ── Delete (soft / deactivate) ──
  const handleDelete = async (schema: Schema) => {
    if (!window.confirm(`Deactivate schema "${schema.name}"?`)) return;
    try {
      await del(`/schemas/${schema.id}/`);
      setDirtyEdits((prev) => {
        const next = new Map(prev);
        next.delete(schema.id);
        return next;
      });
      if (selectedId === schema.id) setSelectedId(null);
      await fetchSchemas();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  // ── Reactivate ──
  const handleReactivate = async (schema: Schema) => {
    try {
      await patch(`/schemas/${schema.id}/`, { is_active: true });
      await fetchSchemas();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reactivate");
    }
  };

  // ── Select a schema → open in detail panel & start editing ──
  const handleSelect = (schema: Schema) => {
    if (selectedId === schema.id) {
      setSelectedId(null);
    } else {
      setSelectedId(schema.id);
      setDirtyEdits((prev) => {
        if (prev.has(schema.id)) return prev;
        const next = new Map(prev);
        next.set(schema.id, {
          ...schema,
          columns: schema.columns.map((c) => ({ ...c })),
        });
        return next;
      });
    }
  };

  // ── Column editing helpers (operate on dirty copy) ──

  const addColumn = (id: number) => {
    setDirtyEdits((prev) => {
      const next = new Map(prev);
      const s = next.get(id);
      if (!s) return prev;
      next.set(id, {
        ...s,
        columns: [...s.columns, { name: "", type: "Text" as const }],
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
      const s = next.get(id);
      if (!s) return prev;
      const cols = [...s.columns];
      cols[index] = { ...cols[index], [field]: value };
      next.set(id, { ...s, columns: cols });
      return next;
    });
  };

  const removeColumn = (id: number, index: number) => {
    setDirtyEdits((prev) => {
      const next = new Map(prev);
      const s = next.get(id);
      if (!s) return prev;
      next.set(id, {
        ...s,
        columns: s.columns.filter((_, i) => i !== index),
      });
      return next;
    });
  };

  const moveColumn = (id: number, index: number, direction: "up" | "down") => {
    setDirtyEdits((prev) => {
      const next = new Map(prev);
      const s = next.get(id);
      if (!s) return prev;
      const cols = [...s.columns];
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= cols.length) return prev;
      [cols[index], cols[target]] = [cols[target], cols[index]];
      next.set(id, { ...s, columns: cols });
      return next;
    });
  };

  // ── Save all dirty schemas ──
  const saveAllChanges = async () => {
    if (dirtyEdits.size === 0) return;
    setSaving(true);
    setError(null);
    let failed = 0;
    for (const [, s] of dirtyEdits) {
      try {
        const payload: SchemaPayload = {
          name: s.name,
          prefix: s.prefix,
          schema_type: s.schema_type,
          columns: s.columns,
        };
        await put(`/schemas/${s.id}/`, payload);
      } catch {
        failed++;
      }
    }
    setDirtyEdits(new Map());
    await fetchSchemas();
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
        "DELETE ALL ENTITIES? This will permanently delete every entity. This cannot be undone.",
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

  const handleDeleteAllSchemas = async () => {
    if (
      !window.confirm(
        "DELETE ALL SCHEMAS? This will permanently delete every schema. This cannot be undone.",
      )
    )
      return;
    setDangerLoading("schemas");
    setDangerResult(null);
    try {
      await del("/schemas/delete_all/");
      setDangerResult("All schemas deleted.");
      await fetchSchemas();
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
      await fetchSchemas();
    } catch (err) {
      setDangerResult(
        `Failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      setDangerLoading(null);
    }
  };

  if (loading) return <p className="empty">Loading…</p>;

  const selectedSchema = selectedId
    ? schemas.find((s) => s.id === selectedId) ?? null
    : null;
  const editingSchema = selectedId
    ? dirtyEdits.get(selectedId)
    : undefined;
  const visibleSchemas = (showArchived
    ? schemas
    : schemas.filter((s) => s.is_active)
  ).filter((s) => !s.is_default);
  const dirtyCount = dirtyEdits.size;

  return (
    <div
      className={`page settings-page${selectedSchema ? " has-detail" : ""}`}
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
        className={`settings-master-detail ${selectedSchema ? "has-detail" : ""}`}
      >
        <TypeMasterPanel
          schemas={visibleSchemas}
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
          newSchemaType={newSchemaType}
          onNewSchemaTypeChange={setNewSchemaType}
          schemaTypes={schemaTypes}
          onCreate={handleCreate}
          saving={saving}
          dirtyEdits={dirtyEdits}
        />

        {selectedSchema && editingSchema && (
          <TypeDetailPanel
            liveSchema={selectedSchema}
            editingSchema={editingSchema}
            isDirty={dirtyEdits.has(selectedSchema.id)}
            onClose={() => setSelectedId(null)}
            onDeactivate={handleDelete}
            onReactivate={handleReactivate}
            columnProps={{
              columns: editingSchema.columns,
              onAdd: () => addColumn(selectedSchema.id),
              onUpdate: (i, field, value) =>
                updateColumn(selectedSchema.id, i, field, value),
              onRemove: (i) => removeColumn(selectedSchema.id, i),
              onMove: (i, dir) => moveColumn(selectedSchema.id, i, dir),
              onDiscard: () => discardEdits(selectedSchema.id),
            }}
          />
        )}
      </div>

      <DangerZone
        dangerLoading={dangerLoading}
        dangerResult={dangerResult}
        onDeleteAllElms={handleDeleteAllElms}
        onDeleteAllEntities={handleDeleteAllEntities}
        onDeleteAllSchemas={handleDeleteAllSchemas}
        onDeleteEverything={handleDeleteEverything}
      />
    </div>
  );
}

export default SettingsPage;
