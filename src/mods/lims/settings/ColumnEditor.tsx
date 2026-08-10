import { useState, useEffect, useMemo } from "react";
import { ArrowUp, ArrowDown, Trash2, Settings2, Type, Circle } from "lucide-react";
import type { ColumnDef } from "../types";
import { ModRegistry } from "../../../shell/src/mod-system/ModRegistry";
import { listDropdowns } from "../../dropdowns/api";
import type { Dropdown } from "../../dropdowns/types";
import { getSchemas, getSchemaTypes } from "../hub/api";
import type { Schema, SchemaTypeItem } from "../types";
import { resolveColorHex, deriveForeground } from "../../../shell/src/shared/components/IconBadge";
import { getColumnTypeIcon } from "../../../shell/src/shared/components/CellEditors";
import { Input } from "../../../shell/src/shared/primitives/Input";
import { Select } from "../../../shell/src/shared/primitives/Input";

function resolveTypeColor(typeId: string): { bg: string; fg: string } {
  const ct = ModRegistry.getInstance().getColumnType(typeId);
  const colorKey = ct?.color || "muted";
  const hex = resolveColorHex(colorKey);
  return { bg: hex, fg: deriveForeground(hex) };
}

export interface ColumnEditorProps {
  columns: ColumnDef[];
  onUpdate: (
    index: number,
    field: keyof ColumnDef,
    value: string | boolean | number,
  ) => void;
  onRemove: (index: number) => void;
  onMove: (index: number, direction: "up" | "down") => void;
}


function isNameCollision(value: string): boolean {
  return value.trim().toLowerCase() === "name";
}

function ColumnEditor({
  columns,
  onUpdate,
  onRemove,
  onMove,
}: ColumnEditorProps) {
  const columnTypes = ModRegistry.getInstance().getColumnTypes();
  const textType = columnTypes.get("text");
  const [dropdowns, setDropdowns] = useState<Dropdown[]>([]);
  const [schemas, setSchemas] = useState<Schema[]>([]);
  const [schemaTypes, setSchemaTypes] = useState<SchemaTypeItem[]>([]);

  useEffect(() => {
    listDropdowns()
      .then(setDropdowns)
      .catch(() => setDropdowns([]));
  }, []);

  useEffect(() => {
    getSchemas()
      .then(setSchemas)
      .catch(() => setSchemas([]));
    getSchemaTypes()
      .then(setSchemaTypes)
      .catch(() => setSchemaTypes([]));
  }, []);

  const schemaTypeGroups = useMemo(() => {
    const stMap = new Map(schemaTypes.map((st) => [st.id, st.display_name]));
    const groups = new Map<string, Schema[]>();
    for (const s of schemas) {
      const typeName = stMap.get(s.schema_type) || "Other";
      if (!groups.has(typeName)) groups.set(typeName, []);
      groups.get(typeName)!.push(s);
    }
    return [...groups.entries()];
  }, [schemas, schemaTypes]);

  const handleNameChange = (
    index: number,
    field: keyof ColumnDef,
    value: string,
  ) => {
    if (field === "name" && isNameCollision(value)) {
      alert("Name is already a default column.");
      return;
    }
    onUpdate(index, field, value);
  };

  const renderTypeOption = (ct: {
    id: string;
    displayName: string;
  }) => (
    <option key={ct.id} value={ct.id}>
      {ct.displayName}
    </option>
  );

  return (
    <div>
      <div className="grid grid-cols-1 gap-2 border-b border-[var(--color-ink-hairline)] bg-[var(--color-surface)]/60 px-4 py-2 md:grid-cols-[minmax(0,1fr)_150px_120px_92px] md:items-center">
        <span className="text-xs font-medium text-[var(--color-ink-muted-foreground)]">
          Field name
        </span>
        <span className="text-xs font-medium text-[var(--color-ink-muted-foreground)]">
          Field type
        </span>
        <span className="text-xs font-medium text-[var(--color-ink-muted-foreground)]">
          Constraints
        </span>
        <span className="text-xs font-medium text-[var(--color-ink-muted-foreground)]">
          Order
        </span>
      </div>

      <div
        className="border-b border-[var(--color-ink-hairline)]"
        data-testid="name-pseudo-column"
      >
        <div className="grid grid-cols-1 gap-2 px-4 py-2 md:grid-cols-[minmax(0,1fr)_150px_120px_92px] md:items-center">
          <div className="flex items-center gap-2">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-[var(--color-surface-hover)] text-[var(--color-ink-muted-foreground)]">
              <Type size={12} />
            </span>
            <input
              type="text"
              value="Name"
              disabled
              className="w-full rounded outline-none focus:outline-none focus:ring-0 bg-transparent px-1 py-1 text-base text-[var(--color-ink-muted-foreground)]"
              title="Name is an implicit column on every schema — it cannot be edited or removed."
            />
          </div>
          <Select disabled className="border-[var(--color-ink-hairline)] bg-[var(--color-background)] px-2 py-1 text-sm text-[var(--color-ink-muted-foreground)]">
            <option value="text">
              {textType?.displayName ?? "Text"}
            </option>
          </Select>
          <div />
          <div />
        </div>
      </div>

      {columns.map((col, i) => {
        const ct = ModRegistry.getInstance().getColumnType(col.type);
        const Icon = ct?.icon ? getColumnTypeIcon(ct.icon) : Circle;
        const typeColor = resolveTypeColor(col.type);
        return (
          <div
            key={i}
            className="border-b border-[var(--color-ink-hairline)] last:border-b-0"
          >
            <div className="grid grid-cols-1 gap-2 px-4 py-2 md:grid-cols-[minmax(0,1fr)_150px_120px_92px] md:items-center hover:bg-[var(--color-surface-hover)]">
              <div className="flex items-center gap-2">
                <span
                  className="grid h-6 w-6 shrink-0 place-items-center rounded"
                  style={{ backgroundColor: typeColor.bg, color: typeColor.fg }}
                >
                  <Icon size={12} />
                </span>
                <Input
                  value={col.name}
                  onChange={(e) =>
                    handleNameChange(i, "name", e.target.value)
                  }
                  placeholder="Column name"
                  className="w-full border-0 bg-transparent px-1 py-1 text-base outline-none focus:outline-none focus:ring-0 placeholder:text-[var(--color-ink-muted-foreground)]"
                />
              </div>
              <div>
                <Select
                  value={col.type}
                  onChange={(e) =>
                    onUpdate(i, "type", e.target.value)
                  }
                  className="rounded-md border-[var(--color-ink-hairline)] bg-[var(--color-background)] px-2 py-1 text-sm"
                >
                  {[...columnTypes.values()].map(renderTypeOption)}
                </Select>
                {col.type === "dropdown" && (
                  <Select
                    value={col.dropdownId ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      onUpdate(
                        i,
                        "dropdownId",
                        raw ? Number(raw) : "",
                      );
                    }}
                    className="mt-1 rounded-md border-[var(--color-ink-hairline)] bg-[var(--color-background)] px-2 py-1 text-sm"
                    title="Dropdown (controlled vocabulary) for this column"
                    aria-label="Dropdown"
                  >
                    <option value="">No dropdown</option>
                    {dropdowns.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </Select>
                )}
                {col.type === "reference" && (
                  <Select
                    value={col.referenceSchemaId ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      onUpdate(
                        i,
                        "referenceSchemaId",
                        raw ? Number(raw) : "",
                      );
                    }}
                    className="mt-1 rounded-md border-[var(--color-ink-hairline)] bg-[var(--color-background)] px-2 py-1 text-sm"
                    title="Target schema for this reference column"
                    aria-label="Target schema"
                  >
                    <option value="">No target</option>
                    {schemaTypeGroups.map(([typeName, typeSchemas]) => (
                      <optgroup key={typeName} label={typeName}>
                        {typeSchemas.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.prefix})
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </Select>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  className={`rounded px-1.5 py-0.5 font-[var(--font-label)] text-2xs uppercase transition-colors ${
                    col.required
                      ? "border-[var(--color-primary-subtle)] bg-[var(--color-primary-subtle)] font-medium text-[var(--color-ink)]"
                      : "bg-[var(--color-surface)] text-[var(--color-ink-muted-foreground)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)]"
                  }`}
                  onClick={() =>
                    onUpdate(i, "required", !col.required)
                  }
                >
                  req
                </button>
                <button
                  type="button"
                  className={`rounded px-1.5 py-0.5 font-[var(--font-label)] text-2xs uppercase transition-colors ${
                    col.unique
                      ? "border-[var(--color-primary-subtle)] bg-[var(--color-primary-subtle)] font-medium text-[var(--color-ink)]"
                      : "bg-[var(--color-surface)] text-[var(--color-ink-muted-foreground)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)]"
                  }`}
                  onClick={() =>
                    onUpdate(i, "unique", !col.unique)
                  }
                >
                  uniq
                </button>
              </div>
              <div className="flex items-center justify-end gap-0.5">
                <button
                  title="Move up"
                  className="grid h-6 w-6 place-items-center rounded border-transparent bg-transparent text-[var(--color-ink-muted-foreground)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)] disabled:opacity-30"
                  disabled={i === 0}
                  onClick={() => onMove(i, "up")}
                >
                  <ArrowUp size={12} />
                </button>
                <button
                  title="Move down"
                  className="grid h-6 w-6 place-items-center rounded border-transparent bg-transparent text-[var(--color-ink-muted-foreground)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)] disabled:opacity-30"
                  disabled={i === columns.length - 1}
                  onClick={() => onMove(i, "down")}
                >
                  <ArrowDown size={12} />
                </button>
                <button
                  title="Options"
                  className="grid h-6 w-6 place-items-center rounded border-transparent bg-transparent text-[var(--color-ink-muted-foreground)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)]"
                >
                  <Settings2 size={12} />
                </button>
                <button
                  title="Delete"
                  className="grid h-6 w-6 place-items-center rounded border-transparent bg-transparent text-[var(--color-ink-muted-foreground)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)]"
                  onClick={() => onRemove(i)}
                >
                  <Trash2 size={12} className="text-[var(--color-destructive)]" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default ColumnEditor;
