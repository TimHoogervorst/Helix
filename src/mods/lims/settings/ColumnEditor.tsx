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
  isResultSchema?: boolean;
}


function isNameCollision(value: string): boolean {
  return value.trim().toLowerCase() === "name";
}

function ColumnEditor({
  columns,
  onUpdate,
  onRemove,
  onMove,
  isResultSchema = false,
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

  const entityColumn = isResultSchema ? columns[0] : undefined;
  const userColumns = isResultSchema ? columns.slice(1) : columns;
  const formulaNames = userColumns
    .filter((column) => column.name.trim())
    .map((column) => column.name.trim());
  const formulaError = (expression: string, currentName = ""): string | null => {
    if (!expression.trim()) return "Expression is required.";
    const references = [...expression.matchAll(/\[([^\]]*)\]/g)];
    const withoutReferences = expression.replace(/\[[^\]]*\]/g, "");
    if (withoutReferences.includes("[") || withoutReferences.includes("]")) {
      return "Use [Column Name] for column references.";
    }
    if (references.length === 0) {
      return "Reference at least one sibling column with [Column Name].";
    }
    const unknown = references.find((match) => !formulaNames.includes(match[1].trim()));
    if (unknown) return `Unknown column: ${unknown[1].trim() || "(empty)"}.`;
    return currentName && references.some((match) => match[1].trim() === currentName.trim())
      ? "A formula cannot reference itself."
      : null;
  };

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

      {!isResultSchema && <div
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
      </div>}

      {isResultSchema && entityColumn && (
        <div className="border-b border-[var(--color-ink-hairline)]" data-testid="entity-column">
          <div className="grid grid-cols-1 gap-2 px-4 py-2 md:grid-cols-[minmax(0,1fr)_150px_1fr_92px] md:items-center">
            <Input value="Entity" disabled title="The Entity Column is required on every result schema." />
            <Select value="reference" disabled aria-label="Entity Column type"><option value="reference">Reference</option></Select>
            <div className="flex flex-col gap-1">
              <Select
                value={entityColumn.referenceSchemaId ?? ""}
                onChange={(e) => {
                  const value = e.target.value;
                  onUpdate(0, "referenceSchemaId", value ? Number(value) : "");
                  if (value) onUpdate(0, "referenceSchemaTypeId", "");
                }}
                aria-label="Entity Column target schema"
              >
                <option value="">Target Schema</option>
                {schemaTypeGroups.flatMap(([, typeSchemas]) => typeSchemas.map((schema) => (
                  <option key={schema.id} value={schema.id}>{schema.name} ({schema.prefix})</option>
                )))}
              </Select>
              <Select
                value={entityColumn.referenceSchemaTypeId ?? ""}
                onChange={(e) => {
                  const value = e.target.value;
                  onUpdate(0, "referenceSchemaTypeId", value ? Number(value) : "");
                  if (value) onUpdate(0, "referenceSchemaId", "");
                }}
                aria-label="Entity Column target schema type"
              >
                <option value="">Target Schema Type</option>
                {schemaTypes.map((schemaType) => (
                  <option key={schemaType.id} value={schemaType.id}>{schemaType.display_name}</option>
                ))}
              </Select>
            </div>
            <div />
          </div>
        </div>
      )}

      {(isResultSchema ? userColumns : columns).map((col, i) => {
        const columnIndex = isResultSchema ? i + 1 : i;
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
                     handleNameChange(columnIndex, "name", e.target.value)
                  }
                  placeholder="Column name"
                  className="w-full border-0 bg-transparent px-1 py-1 text-base outline-none focus:outline-none focus:ring-0 placeholder:text-[var(--color-ink-muted-foreground)]"
                />
              </div>
              <div>
                <Select
                  value={col.type}
                    onChange={(e) =>
                     onUpdate(columnIndex, "type", e.target.value)
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
                         columnIndex,
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
                        columnIndex,
                        "referenceSchemaId",
                        raw ? Number(raw) : "",
                      );
                      if (raw) onUpdate(columnIndex, "referenceSchemaTypeId", "");
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
          {col.type === "formula" && (
                  <div className="mt-1 space-y-1">
                    <Input
                      value={col.expression ?? ""}
                      onChange={(e) => onUpdate(columnIndex, "expression", e.target.value)}
                      placeholder="e.g. [Amount] * [Count]"
                      aria-label="Formula expression"
                    />
                    <Select
                      value={col.resultType ?? "text"}
                      onChange={(e) => onUpdate(columnIndex, "resultType", e.target.value)}
                      aria-label="Formula result type"
                    >
                      <option value="text">Text</option>
                      <option value="number">Number</option>
                      <option value="date">Date</option>
                      <option value="boolean">Boolean</option>
                    </Select>
                    {formulaError(col.expression ?? "", col.name) && (
                      <p className="text-xs text-[var(--color-warning)]" role="alert">
                        {formulaError(col.expression ?? "", col.name)}
                      </p>
                    )}
                  </div>
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
                     onUpdate(columnIndex, "required", !col.required)
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
                     onUpdate(columnIndex, "unique", !col.unique)
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
                   onClick={() => onMove(columnIndex, "up")}
                >
                  <ArrowUp size={12} />
                </button>
                <button
                  title="Move down"
                  className="grid h-6 w-6 place-items-center rounded border-transparent bg-transparent text-[var(--color-ink-muted-foreground)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)] disabled:opacity-30"
                   disabled={i === userColumns.length - 1}
                   onClick={() => onMove(columnIndex, "down")}
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
                   onClick={() => onRemove(columnIndex)}
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
