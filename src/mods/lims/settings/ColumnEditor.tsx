import { useState, useEffect } from "react";
import {
  ArrowUp,
  ArrowDown,
  Trash2,
  Settings2,
  FlaskConical,
  Dna,
  Hash,
  List,
  Link2,
  Calendar,
  Type,
  ToggleLeft,
  Braces,
  Paperclip,
} from "lucide-react";
import type { ColumnDef } from "../types";
import { ModRegistry } from "../../../shell/src/mod-system/ModRegistry";
import { listDropdowns } from "../../dropdowns/api";
import type { Dropdown } from "../../dropdowns/types";
import { resolveColorHex, deriveForeground } from "../../../shell/src/shared/components/IconBadge";

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

const COLUMN_ICONS = [
  FlaskConical,
  Dna,
  Hash,
  List,
  Link2,
  Calendar,
  Type,
  ToggleLeft,
  Braces,
  Paperclip,
];

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

  useEffect(() => {
    listDropdowns()
      .then(setDropdowns)
      .catch(() => setDropdowns([]));
  }, []);

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
      <div className="grid grid-cols-1 gap-2 border-b border-hairline bg-surface/60 px-4 py-2 md:grid-cols-[minmax(0,1fr)_150px_120px_92px] md:items-center">
        <span className="text-[11px] font-medium text-muted-foreground">
          Field name
        </span>
        <span className="text-[11px] font-medium text-muted-foreground">
          Field type
        </span>
        <span className="text-[11px] font-medium text-muted-foreground">
          Constraints
        </span>
        <span className="text-[11px] font-medium text-muted-foreground">
          Order
        </span>
      </div>

      <div
        className="border-b border-hairline"
        data-testid="name-pseudo-column"
      >
        <div className="grid grid-cols-1 gap-2 px-4 py-2 md:grid-cols-[minmax(0,1fr)_150px_120px_92px] md:items-center">
          <div className="flex items-center gap-2">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-muted text-muted-foreground">
              <Type size={12} />
            </span>
            <input
              type="text"
              value="Name"
              disabled
              className="w-full rounded outline-none focus:outline-none focus:ring-0 bg-transparent px-1 py-1 text-[13px] text-muted-foreground"
              title="Name is an implicit column on every schema — it cannot be edited or removed."
            />
          </div>
          <select
            disabled
            className="rounded-md border border-hairline bg-background px-2 py-1 text-[12px] text-muted-foreground"
          >
            <option value="text">
              {textType?.displayName ?? "Text"}
            </option>
          </select>
          <div />
          <div />
        </div>
      </div>

      {columns.map((col, i) => {
        const Icon = COLUMN_ICONS[i % COLUMN_ICONS.length];
        const typeColor = resolveTypeColor(col.type);
        return (
          <div
            key={i}
            className="border-b border-hairline last:border-b-0"
          >
            <div className="grid grid-cols-1 gap-2 px-4 py-2 md:grid-cols-[minmax(0,1fr)_150px_120px_92px] md:items-center hover:bg-muted/40">
              <div className="flex items-center gap-2">
                <span
                  className="grid h-6 w-6 shrink-0 place-items-center rounded"
                  style={{ backgroundColor: typeColor.bg, color: typeColor.fg }}
                >
                  <Icon size={12} />
                </span>
                <input
                  type="text"
                  value={col.name}
                  onChange={(e) =>
                    handleNameChange(i, "name", e.target.value)
                  }
                  placeholder="Column name"
                  className="w-full border-0 bg-transparent px-1 py-1 text-[13px] outline-none focus:outline-none focus:ring-0 placeholder:text-muted-foreground"
                />
              </div>
              <div>
                <select
                  value={col.type}
                  onChange={(e) =>
                    onUpdate(i, "type", e.target.value)
                  }
                  className="rounded-md border border-hairline bg-background px-2 py-1 text-[12px]"
                >
                  {[...columnTypes.values()].map(renderTypeOption)}
                </select>
                {col.type === "dropdown" && (
                  <select
                    value={col.dropdownId ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      onUpdate(
                        i,
                        "dropdownId",
                        raw ? Number(raw) : "",
                      );
                    }}
                    className="mt-1 rounded-md border border-hairline bg-background px-2 py-1 text-[12px]"
                    title="Dropdown (controlled vocabulary) for this column"
                    aria-label="Dropdown"
                  >
                    <option value="">No dropdown</option>
                    {dropdowns.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  type="button"
                  className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase transition-colors ${
                    col.required
                      ? "border-[#b8dfd0] bg-[#E7F7F3] font-medium text-foreground"
                      : "border-gray-200 bg-white text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                  onClick={() =>
                    onUpdate(i, "required", !col.required)
                  }
                >
                  req
                </button>
                <button
                  type="button"
                  className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase transition-colors ${
                    col.unique
                      ? "border-[#b8dfd0] bg-[#E7F7F3] font-medium text-foreground"
                      : "border-gray-200 bg-white text-muted-foreground hover:bg-muted hover:text-foreground"
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
                  className="grid h-6 w-6 place-items-center rounded border-transparent bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                  disabled={i === 0}
                  onClick={() => onMove(i, "up")}
                >
                  <ArrowUp size={12} />
                </button>
                <button
                  title="Move down"
                  className="grid h-6 w-6 place-items-center rounded border-transparent bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                  disabled={i === columns.length - 1}
                  onClick={() => onMove(i, "down")}
                >
                  <ArrowDown size={12} />
                </button>
                <button
                  title="Options"
                  className="grid h-6 w-6 place-items-center rounded border-transparent bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Settings2 size={12} />
                </button>
                <button
                  title="Delete"
                  className="grid h-6 w-6 place-items-center rounded border-transparent bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => onRemove(i)}
                >
                  <Trash2 size={12} className="text-destructive" />
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
