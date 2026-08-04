import { useState, useEffect, useCallback } from "react";
import { get, post, put } from "../../../shell/src/api/client";
import type { Schema, SchemaPayload, SchemaTypeItem, ColumnDef } from "../types";
import ColumnEditor from "./ColumnEditor";
import { SettingsPageLayout } from "../../../shell/src/shared/components/SettingsPageLayout";
import { SettingsHeroHeader } from "../../../shell/src/shared/components/SettingsHeroHeader";
import { SettingsSectionCard } from "../../../shell/src/shared/components/SettingsSectionCard";
import {
  SettingsMasterList,
  type MasterListRow,
} from "../../../shell/src/shared/components/SettingsMasterList";
import { IconBadge } from "../../../shell/src/shared/components/IconBadge";
import { IconPickerPopover } from "../../../shell/src/shared/components/IconPickerPopover";

function SettingsPage() {
  const [schemas, setSchemas] = useState<Schema[]>([]);
  const [schemaTypes, setSchemaTypes] = useState<SchemaTypeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dirtyEdits, setDirtyEdits] = useState<Map<number, Schema>>(new Map());
  const [saving, setSaving] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPrefix, setNewPrefix] = useState("");
  const [newSchemaType, setNewSchemaType] = useState<number | null>(null);
  const [filterValue, setFilterValue] = useState("");
  const [newIcon, setNewIcon] = useState("circle");
  const [newColor, setNewColor] = useState("muted");

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
        icon: newIcon,
        color: newColor,
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

  // ── Select a schema → open in detail & start editing ──
  const handleSelect = (id: string | number) => {
    const schemaId = Number(id);
    if (selectedId === schemaId) {
      setSelectedId(null);
    } else {
      setSelectedId(schemaId);
      setDirtyEdits((prev) => {
        if (prev.has(schemaId)) return prev;
        const schema = schemas.find((s) => s.id === schemaId);
        if (!schema) return prev;
        const next = new Map(prev);
        next.set(schemaId, {
          ...schema,
          columns: schema.columns.map((c) => ({ ...c })),
        });
        return next;
      });
    }
  };

  // ── Schema field editing ──
  const updateSchemaField = (
    id: number,
    field: keyof Schema,
    value: string,
  ) => {
    setDirtyEdits((prev) => {
      const next = new Map(prev);
      const s = next.get(id);
      if (!s) return prev;
      next.set(id, { ...s, [field]: value });
      return next;
    });
  };

  // ── Column editing helpers (operate on dirty copy) ──

  const addColumn = (id: number) => {
    setDirtyEdits((prev) => {
      const next = new Map(prev);
      const s = next.get(id);
      if (!s) return prev;
      next.set(id, {
        ...s,
        columns: [...s.columns, { name: "", type: "text" }],
      });
      return next;
    });
  };

  const updateColumn = (
    id: number,
    index: number,
    field: keyof ColumnDef,
    value: string | boolean | number,
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
          description: s.description,
          prefix: s.prefix,
          schema_type: s.schema_type,
          columns: s.columns,
          icon: s.icon,
          color: s.color,
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

  // ── Discard all dirty edits ──
  const discardAllEdits = () => {
    setDirtyEdits(new Map());
  };

  const visibleSchemas = (showArchived
    ? schemas
    : schemas.filter((s) => s.is_active)
  ).filter((s) => !s.is_default);

  const filteredSchemas = filterValue
    ? visibleSchemas.filter(
        (s) =>
          s.name.toLowerCase().includes(filterValue.toLowerCase()) ||
          s.prefix.toLowerCase().includes(filterValue.toLowerCase()),
      )
    : visibleSchemas;

  const masterRows: MasterListRow[] = filteredSchemas.map((s) => ({
    id: s.id,
    label: s.name,
    secondary: s.prefix,
    dirty: dirtyEdits.has(s.id),
    icon: (
      <IconBadge
        iconKey={s.icon || "circle"}
        colorKey={s.color || "muted"}
        size="sm"
      />
    ),
    iconBg: "",
    iconFg: "",
  }));

  const selectedSchema = selectedId
    ? schemas.find((s) => s.id === selectedId) ?? null
    : null;
  const editingSchema = selectedId ? dirtyEdits.get(selectedId) : undefined;
  const dirtyCount = dirtyEdits.size;

  if (loading) return <p className="empty">Loading…</p>;

  return (
    <SettingsPageLayout
      hero={
        <>
          <SettingsHeroHeader
            eyebrow="schema directory"
            title="Registry schemas"
            description="Define the schemas that structure your entity data. Each schema controls what columns appear on entities created from it."
            actions={
              <button
                type="button"
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                onClick={() => {
                  setShowNew(!showNew);
                  if (!showNew) {
                    setNewIcon("circle");
                    setNewColor("muted");
                  }
                }}
              >
                + New schema
              </button>
            }
          />

          {showNew && (
            <div className="mb-6 rounded-lg border border-hairline bg-panel p-4">
              <div className="flex flex-wrap items-end gap-4">
                <IconPickerPopover
                  iconKey={newIcon}
                  colorKey={newColor}
                  size="sm"
                  onChange={(icon, color) => {
                    setNewIcon(icon);
                    setNewColor(color);
                  }}
                />
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted-foreground">Name</span>
                  <input
                    type="text"
                    className="rounded-md border border-hairline bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-primary/50"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g., Blood Sample"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted-foreground">Prefix</span>
                  <input
                    type="text"
                    className="rounded-md border border-hairline bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-primary/50"
                    value={newPrefix}
                    onChange={(e) => setNewPrefix(e.target.value.toUpperCase())}
                    placeholder="e.g., BLOOD"
                    maxLength={20}
                    style={{ width: 120 }}
                  />
                </label>
                {schemaTypes.length > 0 && (
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted-foreground">
                      Schema Type
                    </span>
                    <select
                      className="rounded-md border border-hairline bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-primary/50"
                      value={newSchemaType ?? ""}
                      onChange={(e) => setNewSchemaType(Number(e.target.value))}
                    >
                      {schemaTypes.map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.display_name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                    onClick={handleCreate}
                    disabled={
                      saving ||
                      !newName.trim() ||
                      !newPrefix.trim() ||
                      newSchemaType === null
                    }
                  >
                    {saving ? "Creating…" : "Create"}
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/50"
                    onClick={() => setShowNew(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      }
      bottomBar={
        dirtyCount > 0 ? (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {dirtyCount} schema{dirtyCount !== 1 ? "s" : ""} with unsaved
              changes
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-md border-transparent bg-transparent px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onClick={discardAllEdits}
              >
                Discard Changes
              </button>
              <button
                type="button"
                className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                onClick={saveAllChanges}
                disabled={saving}
              >
                {saving ? "Saving…" : `Save Changes (${dirtyCount})`}
              </button>
            </div>
          </div>
        ) : undefined
      }
    >
      {error && (
        <div className="mb-4 rounded-md border border-warn/30 bg-warn/10 px-4 py-2.5 text-sm text-warn">
          {error}
        </div>
      )}

      {/* Master–detail layout */}
      <div className="flex min-h-0 gap-0">
        <div className="w-64 shrink-0">
          <SettingsMasterList
            rows={masterRows}
            selectedId={selectedId}
            filterValue={filterValue}
            onFilterChange={setFilterValue}
            onSelect={handleSelect}
            filterPlaceholder="Filter schemas"
            actions={
              <button
                type="button"
                className={`rounded border-transparent bg-transparent px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors ${
                  showArchived
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setShowArchived(!showArchived)}
                title={showArchived ? "Hide archived" : "Show archived"}
              >
                {showArchived ? "Active" : "All"}
              </button>
            }
          />
          {masterRows.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              No schemas found.
            </p>
          )}
        </div>

        <div className="flex-1 space-y-4 p-6">
          {selectedSchema && editingSchema ? (
            <>
              <SettingsSectionCard
                title="Schema definition"
                subtitle="Identity fields"
              >
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <IconPickerPopover
                      iconKey={editingSchema.icon || "circle"}
                      colorKey={editingSchema.color || "muted"}
                      size="md"
                      onChange={(icon, color) => {
                        setDirtyEdits((prev) => {
                          const next = new Map(prev);
                          const s = next.get(editingSchema.id);
                          if (!s) return prev;
                          next.set(editingSchema.id, { ...s, icon, color });
                          return next;
                        });
                      }}
                    />
                    <div className="grid grid-cols-[1fr_auto] gap-4 flex-1">
                      <label className="block">
                        <span className="text-[11px] font-medium text-muted-foreground">
                          Name
                        </span>
                        <input
                          type="text"
                          className="mt-1 block w-full rounded-md border border-hairline bg-muted px-2.5 py-1.5 text-sm outline-none focus:border-primary/50"
                          value={editingSchema.name}
                          onChange={(e) =>
                            updateSchemaField(
                              editingSchema.id,
                              "name",
                              e.target.value,
                            )
                          }
                        />
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-medium text-muted-foreground">
                          Prefix
                        </span>
                        <input
                          type="text"
                          className="mt-1 block rounded-md border border-hairline bg-muted px-2.5 py-1.5 font-mono text-sm outline-none focus:border-primary/50"
                          style={{ width: 120 }}
                          value={editingSchema.prefix}
                          onChange={(e) =>
                            updateSchemaField(
                              editingSchema.id,
                              "prefix",
                              e.target.value.toUpperCase(),
                            )
                          }
                          maxLength={20}
                        />
                      </label>
                    </div>
                  </div>
                  <label className="block">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      Description
                    </span>
                    <textarea
                      className="mt-1 block w-full resize-none rounded-md border border-hairline bg-muted px-2.5 py-1.5 text-sm outline-none focus:border-primary/50"
                      rows={2}
                      value={editingSchema.description ?? ""}
                      onChange={(e) =>
                        updateSchemaField(
                          editingSchema.id,
                          "description",
                          e.target.value,
                        )
                      }
                      placeholder="Optional description of this schema…"
                    />
                  </label>
                </div>
              </SettingsSectionCard>

              <SettingsSectionCard
                flush
                title="Columns"
                subtitle={`${editingSchema.columns.length} user-defined`}
                actions={
                  <button
                    type="button"
                    className="rounded-md border-transparent bg-transparent px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    onClick={() => addColumn(editingSchema.id)}
                  >
                    + Add Column
                  </button>
                }
              >
                <ColumnEditor
                  columns={editingSchema.columns}
                  onUpdate={(i, field, value) =>
                    updateColumn(editingSchema.id, i, field, value)
                  }
                  onRemove={(i) => removeColumn(editingSchema.id, i)}
                  onMove={(i, dir) =>
                    moveColumn(editingSchema.id, i, dir)
                  }
                />
              </SettingsSectionCard>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select a schema from the list to view or edit its details.
            </div>
          )}
        </div>
      </div>
    </SettingsPageLayout>
  );
}

export default SettingsPage;
