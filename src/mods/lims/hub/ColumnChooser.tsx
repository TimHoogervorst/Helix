import { useState, useRef, useEffect } from "react";
import { Columns2, Lock, LockOpen } from "lucide-react";
import type { AvailableColumn } from "../types";
import { ModRegistry } from "../../../shell/src/mod-system/ModRegistry";
import { IconButton } from "../../../shell/src/shared/primitives/IconButton";

// ── Column definition with visibility & lock metadata ───────────────────

/** Runtime column definition used by the table renderer. */
export interface HubColumn {
  key: string;
  label: string;
  source: AvailableColumn["source"];
  /** Whether this column can be hidden. display_id is always visible. */
  hideable: boolean;
  /** Whether this column is sortable by clicking its header. */
  sortable: boolean;
  /** Column type ID from the column type registry (e.g. "text", "number"). */
  type: string;
  /** Icon token from the column type registry (e.g. "type", "hash"). */
  icon: string | null;
  /** Whether this column can be filtered by its type's operators. */
  filterable: boolean;
  /** Default pixel width for the column header, or null for auto-size. */
  width: number | null;
}

// ── Default common columns in display order ─────────────────────────────
//
// Icon metadata is resolved at render time from the column type registry
// (see EntitiesHub.tsx resolveColumnIcon).  The ``icon`` field is seeded
// as null — ``col.icon ?? ct?.icon`` resolves through to the hydrated
// column type's icon token.

/** Resolve the icon token for a column type ID from the registry. */
function resolveColumnIcon(typeId: string): string | null {
  try {
    return ModRegistry.getInstance().getColumnType(typeId)?.icon ?? null;
  } catch {
    return null;
  }
}

export const COMMON_COLUMNS: HubColumn[] = [
  { key: "display_id", label: "ID", source: "common", hideable: false, sortable: false, type: "text", icon: null, filterable: true, width: null },
  { key: "name", label: "Name", source: "common", hideable: true, sortable: true, type: "text", icon: null, filterable: true, width: null },
  { key: "schema_type_id", label: "Schema Type", source: "common", hideable: true, sortable: false, type: "text", icon: null, filterable: true, width: null },
  { key: "status", label: "Status", source: "common", hideable: true, sortable: true, type: "dropdown", icon: null, filterable: true, width: null },
  { key: "author", label: "Author", source: "common", hideable: true, sortable: false, type: "user", icon: null, filterable: true, width: null },
  { key: "created_at", label: "Created", source: "common", hideable: true, sortable: true, type: "datetime", icon: null, filterable: true, width: null },
  { key: "updated_at", label: "Updated", source: "common", hideable: true, sortable: true, type: "datetime", icon: null, filterable: true, width: null },
];

/** Keys of columns visible by default. */
export const DEFAULT_VISIBLE_COLUMNS = new Set([
  "display_id",
  "name",
  "schema_type_id",
  "status",
  "author",
  "updated_at",
]);

// ── Build merged column list ────────────────────────────────────────────

/**
 * Merge common columns with dynamic columns from the API response.
 *
 * Common columns always come first, followed by schema_type columns,
 * then schema columns.  The order within each group follows the API's
 * ``available_columns`` order (which mirrors the Schema/SchemaType column
 * definition order).
 */
export function buildColumns(
  availableColumns: AvailableColumn[],
): HubColumn[] {
  if (availableColumns.length === 0) return COMMON_COLUMNS;

  const commonKeys = new Set(COMMON_COLUMNS.map((c) => c.key));
  const typeColumns: HubColumn[] = [];
  const schemaColumns: HubColumn[] = [];

  for (const col of availableColumns) {
    if (commonKeys.has(col.key)) continue;
    const hubCol: HubColumn = {
      key: col.key,
      label: col.label,
      source: col.source,
      hideable: true,
      sortable: false, // Properties columns not sortable in v1
      type: col.type,
      icon: resolveColumnIcon(col.type),
      filterable: col.filterable,
      width: col.width,
    };
    if (col.source === "schema_type") {
      typeColumns.push(hubCol);
    } else {
      schemaColumns.push(hubCol);
    }
  }

  return [...COMMON_COLUMNS, ...typeColumns, ...schemaColumns];
}

// ── Column Chooser Popover ──────────────────────────────────────────────

interface ColumnChooserProps {
  columns: HubColumn[];
  visibleKeys: Set<string>;
  lockedKeys: Set<number>;
  onToggleColumn: (key: string) => void;
  onToggleLock: (index: number) => void;
}

export function ColumnChooser({
  columns,
  visibleKeys,
  lockedKeys,
  onToggleColumn,
  onToggleLock,
}: ColumnChooserProps) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="entities-filter-columns-wrap" ref={popoverRef}>
      <IconButton
        className={open ? "is-active" : ""}
        aria-label="Column visibility"
        title="Column visibility"
        onClick={() => setOpen((prev) => !prev)}
      >
        <Columns2 size={14} />
      </IconButton>

      {open && (
        <div className="entities-column-chooser-popover">
          <div className="entities-column-chooser-header">
            Columns
          </div>
          <div className="entities-column-chooser-body">
            {columns.map((col, idx) => {
              const isVisible = visibleKeys.has(col.key);
              const isLocked = lockedKeys.has(idx);
              return (
                <div
                  key={col.key}
                  className="entities-column-chooser-row"
                >
                  <label className="entities-column-chooser-label">
                    <input
                      type="checkbox"
                      className="entities-column-chooser-checkbox"
                      checked={isVisible}
                      disabled={!col.hideable}
                      onChange={() => onToggleColumn(col.key)}
                    />
                    <span className="entities-column-chooser-name">
                      {col.label}
                    </span>
                  </label>
                  {col.hideable && (
                    <IconButton
                      className={`entities-column-chooser-lock${isLocked ? " is-locked" : ""}`}
                      aria-label={isLocked ? "Unlock column" : "Lock column"}
                      title={isLocked ? "Unlock column" : "Lock column"}
                      onClick={() => onToggleLock(idx)}
                    >
                      {isLocked ? (
                        <Lock size={13} />
                      ) : (
                        <LockOpen size={13} />
                      )}
                    </IconButton>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
