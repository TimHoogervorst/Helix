import { useState, useEffect, useCallback } from "react";
import { del, get, post, put } from "../../../shell/src/api/client";
import type { Schema, SchemaPayload, SchemaTypeItem, ColumnDef } from "../types";
import ColumnEditor from "./ColumnEditor";
import { Button } from "../../../shell/src/shared/primitives/Button";
import { Input } from "../../../shell/src/shared/primitives/Input";
import { Textarea } from "../../../shell/src/shared/primitives/Input";
import { Select } from "../../../shell/src/shared/primitives/Input";
import { SettingsPageLayout } from "../../../shell/src/shared/components/SettingsPageLayout";
import { SettingsHeroHeader } from "../../../shell/src/shared/components/SettingsHeroHeader";
import { SettingsSectionCard } from "../../../shell/src/shared/components/SettingsSectionCard";
import {
  SettingsMasterList,
  type MasterListRow,
} from "../../../shell/src/shared/components/SettingsMasterList";
import { IconBadge } from "../../../shell/src/shared/components/IconBadge";
import { IconPickerPopover } from "../../../shell/src/shared/components/IconPickerPopover";
import { TabBar } from "../../../shell/src/shared/primitives/TabBar";

type SchemaTab = "entity" | "result";

function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SchemaTab>("entity");
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

  const resultSchemaTypes = schemaTypes.filter((type) =>
    type.tags?.includes("ResultTable"),
  );
  const entitySchemaTypes = schemaTypes.filter((type) =>
    type.tags?.includes("RegistrationTable"),
  );

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
      const allowed = data.filter((type) =>
        type.tags?.includes("RegistrationTable"),
      );
      if (allowed.length > 0 && newSchemaType === null) {
        setNewSchemaType(allowed[0].id);
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
        columns: activeTab === "result"
          ? [{ name: "Entity", type: "reference" }]
          : [],
        icon: activeTab === "result" ? "chart-column" : newIcon,
        color: activeTab === "result" ? "hazard" : newColor,
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
        const entityColumn = schema.columns.find(
          (column) => column.name === "Entity" && column.type === "reference",
        );
        const columns = activeTab === "result"
          ? [
              entityColumn ?? { name: "Entity", type: "reference" },
              ...schema.columns.filter(
                (column) => column.name !== "Entity" || column.type !== "reference",
              ),
            ]
          : schema.columns.map((c) => ({ ...c }));
        next.set(schemaId, {
          ...schema,
          icon: activeTab === "result" ? "chart-column" : schema.icon,
          columns,
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
         columns: [
           ...s.columns,
           { name: "", type: activeTab === "result" ? "formula" : "text" },
         ],
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
          icon: s.tags?.includes("ResultTable") ? "chart-column" : s.icon,
          color: s.tags?.includes("ResultTable") ? "hazard" : s.color,
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
  ).filter(
    (s) =>
      !s.is_default &&
      (activeTab === "result"
        ? s.tags?.includes("ResultTable")
        : s.tags?.includes("RegistrationTable")),
  );

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
         iconKey={activeTab === "result" ? "chart-column" : (s.icon || "circle")}
          colorKey={activeTab === "result" ? "hazard" : (s.color || "muted")}
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

  const handleTabChange = (tab: string) => {
    const nextTab = tab === "result" ? "result" : "entity";
    setActiveTab(nextTab);
    setNewSchemaType((current) => {
      const allowed = nextTab === "result" ? resultSchemaTypes : entitySchemaTypes;
      return allowed.some((type) => type.id === current)
        ? current
        : (allowed[0]?.id ?? null);
    });
    setSelectedId(null);
    setFilterValue("");
  };

  const deleteResultSchema = async () => {
    if (!selectedSchema || activeTab !== "result") return;
    if (!window.confirm(`Delete ${selectedSchema.name}?`)) return;
    setSaving(true);
    setError(null);
    try {
      await del(`/schemas/${selectedSchema.id}/`);
      setSelectedId(null);
      setDirtyEdits((prev) => {
        const next = new Map(prev);
        next.delete(selectedSchema.id);
        return next;
      });
      await fetchSchemas();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setSaving(false);
    }
  };

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
              <Button
                size="sm"
                onClick={() => {
                  setShowNew(!showNew);
                  if (!showNew) {
                    setNewIcon(activeTab === "result" ? "chart-column" : "circle");
                    setNewColor("muted");
                  }
                }}
              >
                + New schema
              </Button>
            }
          />

          {showNew && (
            <div className="mb-6 rounded-lg border border-[var(--color-ink-hairline)] bg-[var(--color-card)] p-4">
              <div className="flex flex-wrap items-end gap-4">
                {activeTab !== "result" && <IconPickerPopover
                    iconKey={newIcon}
                    colorKey={newColor}
                    size="sm"
                    onChange={(icon, color) => {
                      setNewIcon(icon);
                      setNewColor(color);
                    }}
                  />}
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-[var(--color-ink-muted-foreground)]">Name</span>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g., Blood Sample"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-[var(--color-ink-muted-foreground)]">Prefix</span>
                  <Input
                    value={newPrefix}
                    onChange={(e) => setNewPrefix(e.target.value.toUpperCase())}
                    placeholder="e.g., BLOOD"
                    maxLength={20}
                    style={{ width: 120 }}
                  />
                </label>
                {schemaTypes.length > 0 && (
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-[var(--color-ink-muted-foreground)]">
                      Schema Type
                    </span>
                    <Select
                      value={newSchemaType ?? ""}
                      onChange={(e) => setNewSchemaType(Number(e.target.value))}
                    >
                    {(activeTab === "result" ? resultSchemaTypes : entitySchemaTypes).map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.display_name}
                        </option>
                      ))}
                    </Select>
                  </label>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleCreate}
                    disabled={
                      saving ||
                      !newName.trim() ||
                      !newPrefix.trim() ||
                      newSchemaType === null
                    }
                  >
                    {saving ? "Creating…" : "Create"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowNew(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      }
      tabs={
        <TabBar
          tabs={[
            { id: "entity", label: "Entity Schemas", testId: "tab-entity-schemas" },
            { id: "result", label: "Result Schemas", testId: "tab-result-schemas" },
          ]}
          activeTab={activeTab}
          onTabChange={handleTabChange}
        />
      }
      bottomBar={
        dirtyCount > 0 ? (
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--color-ink-muted-foreground)]">
              {dirtyCount} schema{dirtyCount !== 1 ? "s" : ""} with unsaved
              changes
            </span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={discardAllEdits}>
                Discard Changes
              </Button>
              <Button
                size="sm"
                onClick={saveAllChanges}
                disabled={saving}
              >
                {saving ? "Saving…" : `Save Changes (${dirtyCount})`}
              </Button>
            </div>
          </div>
        ) : undefined
      }
    >
      {error && (
        <div className="mb-4 rounded-md border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 px-4 py-2.5 text-sm text-[var(--color-warning)]">
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
                className={`rounded border-transparent bg-transparent px-1.5 py-0.5 font-[var(--font-label)] text-2xs uppercase tracking-wider transition-colors ${
                  showArchived
                    ? "font-medium text-[var(--color-ink)]"
                    : "text-[var(--color-ink-muted-foreground)] hover:text-[var(--color-ink)]"
                }`}
                onClick={() => setShowArchived(!showArchived)}
                title={showArchived ? "Hide archived" : "Show archived"}
              >
                {showArchived ? "Active" : "All"}
              </button>
            }
          />
          {masterRows.length === 0 && (
            <p className="px-3 py-2 text-xs text-[var(--color-ink-muted-foreground)]">
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
                actions={activeTab === "result" ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={deleteResultSchema}
                    disabled={saving}
                  >
                    Delete Result Schema
                  </Button>
                ) : undefined}
              >
                <div className="space-y-3">
                    <div className="flex items-end gap-3">
                     {activeTab !== "result" && <IconPickerPopover
                      iconKey={editingSchema.icon || "circle"}
                      colorKey={editingSchema.color || "muted"}
                      size="lg"
                      onChange={(icon, color) => {
                        setDirtyEdits((prev) => {
                          const next = new Map(prev);
                          const s = next.get(editingSchema.id);
                          if (!s) return prev;
                          next.set(editingSchema.id, { ...s, icon, color });
                          return next;
                        });
                      }}
                     />}
                    <div className="grid grid-cols-[1fr_auto] gap-4 flex-1">
                      <label className="block">
                        <span className="text-xs font-medium text-[var(--color-ink-muted-foreground)]">
                          Name
                        </span>
                        <Input
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
                        <span className="text-xs font-medium text-[var(--color-ink-muted-foreground)]">
                          Prefix
                        </span>
                        <Input
                          className="font-[var(--font-label)]"
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
                    <span className="text-xs font-medium text-[var(--color-ink-muted-foreground)]">
                      Description
                    </span>
                    <Textarea
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
                 subtitle={activeTab === "result"
                   ? `${Math.max(0, editingSchema.columns.length - 1)} user-defined + Entity`
                   : `${editingSchema.columns.length} user-defined`}
                actions={
                  <Button variant="ghost" size="sm" onClick={() => addColumn(editingSchema.id)}>
                    + Add Column
                  </Button>
                }
              >
                <ColumnEditor
                  columns={editingSchema.columns}
                  isResultSchema={activeTab === "result"}
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
            <div className="flex h-full items-center justify-center text-sm text-[var(--color-ink-muted-foreground)]">
              Select a schema from the list to view or edit its details.
            </div>
          )}
        </div>
      </div>
    </SettingsPageLayout>
  );
}

export default SettingsPage;
