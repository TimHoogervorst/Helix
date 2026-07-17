/**
 * React component for the registryTable TipTap block.
 *
 * Three states:
 * 1. **Placeholder** (schemaId === null): compact box with Database icon,
 *    "Registry Table" label, and "Load Schema" button.
 * 2. **Picker open**: a portaled popover lists active EntityTypes fetched
 *    from the LIMS API. Loading and empty states handled.
 * 3. **Loaded table**: title bar (editable title, gray schema name label),
 *    blue-tinted header row, mandatory "Name" column, schema columns showing
 *    "Name (Type)" labels, and placeholder rows with static text (read-only).
 *
 * Schema is locked once loaded — no swap action.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { BlockComponentProps } from "../../../shell/src/mod-system/types";
import { Database, Loader } from "lucide-react";
import { get } from "../../../shell/src/api/client";
import type { EntityTypeSummary } from "../types";
import type { GridColumn } from "../../../shell/src/shared/types/types";
import { useClickOutside } from "../../../shell/src/shared/hooks/useClickOutside";

// ── Inner Content Props ─────────────────────────────────────────────────

interface RegistryTableContentProps {
  schemaId: number | null;
  schemaName: string | null;
  schemaContentHash: string | null;
  title: string;
  columns: GridColumn[];
  updateAttrs: (attrs: Record<string, unknown>) => void;
}

// ── Inner Content Component ─────────────────────────────────────────────

/**
 * Pure rendering logic for the registry table block.
 *
 * Decoupled from TipTap's NodeViewWrapper so it can be reused by both
 * the legacy NodeView path and the new BlockComponentProps path.
 */
export function RegistryTableContent({
  schemaId,
  schemaName,
  schemaContentHash,
  title,
  columns,
  updateAttrs,
}: RegistryTableContentProps) {
  // ── Picker state ────────────────────────────────────────────────────
  const [showPicker, setShowPicker] = useState(false);
  const [entityTypes, setEntityTypes] = useState<EntityTypeSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [pickerPos, setPickerPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const loadBtnRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // ── Fetch entity types when picker opens ────────────────────────────
  const handleOpenPicker = useCallback(async () => {
    setShowPicker(true);
    if (entityTypes.length === 0) {
      setLoading(true);
      try {
        const data = await get<EntityTypeSummary[]>("/lims/entity-types/");
        setEntityTypes(data.filter((t) => t.is_active));
      } catch {
        // silently leave list empty
      } finally {
        setLoading(false);
      }
    }
  }, [entityTypes.length]);

  // ── Position picker relative to the button ──────────────────────────
  useEffect(() => {
    if (!showPicker) {
      setPickerPos(null);
      return;
    }
    const recalc = () => {
      const btn = loadBtnRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      setPickerPos({
        top: rect.bottom + 4,
        left: rect.left,
      });
    };
    recalc();
    window.addEventListener("scroll", recalc, { capture: true, passive: true });
    window.addEventListener("resize", recalc, { passive: true });
    return () => {
      window.removeEventListener("scroll", recalc, { capture: true });
      window.removeEventListener("resize", recalc);
    };
  }, [showPicker]);

  // ── Close picker on outside click ───────────────────────────────────
  useClickOutside(
    [loadBtnRef, pickerRef],
    () => setShowPicker(false),
    showPicker,
  );

  // ── Select an entity type → snapshot schema into block attrs ────────
  const handleSelectEntityType = useCallback(
    (entityType: EntityTypeSummary) => {
      const newColumns: GridColumn[] = entityType.columns.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        required: c.required,
        default: c.default,
        units: c.units,
        description: c.description,
      }));

      updateAttrs({
        schemaId: entityType.id,
        schemaName: entityType.name,
        schemaContentHash: entityType.content_hash,
        columns: newColumns,
      });
      setShowPicker(false);
    },
    [updateAttrs],
  );

  // ── Title editing ───────────────────────────────────────────────────
  const handleTitleBlur = useCallback(
    (e: React.FocusEvent<HTMLSpanElement>) => {
      const newTitle = e.currentTarget.textContent?.trim() || "Registry Table";
      if (newTitle !== title) {
        updateAttrs({ title: newTitle });
      }
    },
    [title, updateAttrs],
  );

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLSpanElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        (e.target as HTMLElement).blur();
      }
    },
    [],
  );

  // ── Placeholder state ───────────────────────────────────────────────
  if (schemaId === null) {
    return (
      <div
        className="rounded-lg border border-hairline bg-panel p-4"
        data-testid="registry-table-placeholder"
      >
        <div className="flex items-center gap-2.5">
          <Database className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm font-medium text-foreground">
            Registry Table
          </span>
        </div>
        <div className="mt-3">
          <button
            ref={loadBtnRef}
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-surface/80 hover:text-foreground transition-colors"
            onClick={handleOpenPicker}
            data-testid="load-schema-btn"
          >
            Load Schema
          </button>
        </div>

        {/* ── Picker popover — portaled to body ────────────────────── */}
        {showPicker &&
          pickerPos &&
          createPortal(
            <div
              ref={pickerRef}
              className="z-50 w-72 max-h-60 overflow-y-auto rounded-md border border-hairline bg-popover shadow-lg"
              style={{
                position: "fixed",
                top: pickerPos.top,
                left: pickerPos.left,
              }}
              data-testid="schema-picker"
            >
              {loading ? (
                <div className="flex items-center justify-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                  <Loader className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Loading schemas…
                </div>
              ) : entityTypes.length === 0 ? (
                <div className="px-3 py-4 text-sm text-muted-foreground">
                  No schemas available. Create one in LIMS → Entity Types.
                </div>
              ) : (
                entityTypes.map((et) => (
                  <button
                    key={et.id}
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-surface/60 transition-colors first:rounded-t-md last:rounded-b-md"
                    onClick={() => handleSelectEntityType(et)}
                    data-testid={`schema-option-${et.id}`}
                  >
                    <span className="font-medium">{et.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({et.prefix})
                    </span>
                  </button>
                ))
              )}
            </div>,
            document.body,
          )}
      </div>
    );
  }

  // ── Loaded table state ──────────────────────────────────────────────
  return (
    <div
      className="rounded-lg border border-hairline bg-panel"
      data-testid="registry-table-loaded"
    >
      {/* Title bar */}
      <div className="flex items-center gap-2 border-b border-hairline px-4 py-2.5">
        <Database className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span
          className="flex-1 text-sm font-medium text-foreground outline-none"
          contentEditable
          suppressContentEditableWarning
          onBlur={handleTitleBlur}
          onKeyDown={handleTitleKeyDown}
          data-testid="registry-table-title"
        >
          {title}
        </span>
        {schemaName && (
          <span
            className="text-xs text-muted-foreground bg-surface px-2 py-0.5 rounded"
            data-testid="registry-table-schema-label"
          >
            {schemaName}
          </span>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="registry-table-grid">
          <thead>
            <tr className="bg-blue-50 border-b border-hairline">
              {/* Mandatory Name column */}
              <th
                className="px-4 py-2 text-left font-medium text-foreground bg-blue-100"
                data-testid="registry-table-header-name"
              >
                Name
              </th>
              {/* Schema columns */}
              {columns.map((col) => (
                <th
                  key={col.name}
                  className="px-4 py-2 text-left font-medium text-foreground"
                  data-testid={`registry-table-header-${col.name}`}
                >
                  {col.name} ({col.type})
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Placeholder rows — static text, no editing */}
            {[1, 2, 3].map((rowIdx) => (
              <tr
                key={rowIdx}
                className="border-b border-hairline last:border-b-0"
                data-testid={`registry-table-row-${rowIdx}`}
              >
                <td className="px-4 py-2 text-muted-foreground italic">
                  —
                </td>
                {columns.map((col) => (
                  <td
                    key={col.name}
                    className="px-4 py-2 text-muted-foreground italic"
                  >
                    —
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Slot-system Block Component ─────────────────────────────────────────

/**
 * Slot-system block component for the registry table.
 *
 * Receives `BlockComponentProps` (no NodeViewWrapper — BlockNodeView
 * provides one). Renders the same inner content.
 */
export function RegistryTableBlockComponent({
  instance,
}: BlockComponentProps) {
  const attrs = instance.attrs as Record<string, unknown>;
  const schemaId = (attrs.schemaId as number | null) ?? null;
  const schemaName = (attrs.schemaName as string | null) ?? null;
  const schemaContentHash =
    (attrs.schemaContentHash as string | null) ?? null;
  const title = (attrs.title as string) || "Registry Table";
  const columns: GridColumn[] = (attrs.columns as GridColumn[]) ?? [];

  return (
    <RegistryTableContent
      schemaId={schemaId}
      schemaName={schemaName}
      schemaContentHash={schemaContentHash}
      title={title}
      columns={columns}
      updateAttrs={instance.updateAttrs}
    />
  );
}
