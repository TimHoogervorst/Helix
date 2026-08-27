import { useCallback, useMemo, useRef, useState } from "react";
import {
  ChartColumn,
  Database,
  Loader,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { createBlockAdapter } from "../../../shell/src/mod-system/createBlockAdapter";
import { get, del, post } from "../../../shell/src/api/client";
import type { GridColumn } from "../../../shell/src/shared/types/types";
import { usePickerPortal } from "../../../shell/src/shared/hooks/usePickerPortal";
import { PickerPortal } from "../../../shell/src/shared/components/PickerPortal";
import { TableKit } from "../../../shell/src/shared/table/TableKit";
import { getColumnTypeIcon } from "../../../shell/src/shared/components/CellEditors";
import {
  deriveForeground,
  resolveColorHex,
} from "../../../shell/src/shared/components/IconBadge";
import { Button } from "../../../shell/src/shared/primitives/Button";
import { IconButton } from "../../../shell/src/shared/primitives/IconButton";
import { TableChrome } from "../../../shell/src/shared/table/TableChrome";
import MoreActions from "../components/MoreActions";
import type { EntityTypeSummary } from "../types";
import type { ElnSidebarData } from "./sidebarData";
import { ModRegistry } from "../../../shell/src/mod-system/ModRegistry";
import { useComputedFields } from "../../../shell/src/shared/hooks/useComputedFields";

export interface ResultTableRow {
  entityId: number | null;
  displayId: string;
  /** Stable identity used to match this row to its Result Entity. */
  resultRowId?: string;
  sourceEntityId: string;
  values: Record<string, unknown>;
  isRegistered: boolean;
  lastRegisteredValueHash: string | null;
  /** Schema hash that produced the last successful registration. */
  lastRegisteredSchemaContentHash?: string | null;
  registrationError: string | null;
}

interface ResultTableProps {
  schemaId: number | null;
  schemaName: string | null;
  schemaContentHash: string | null;
  title: string;
  columns: GridColumn[];
  rows: ResultTableRow[];
  projectId?: number | null;
  folderId?: number | null;
  updateAttrs: (attrs: Record<string, unknown>) => void;
  readOnly?: boolean;
  previewMode?: boolean;
  workspaceId?: string;
}

interface BatchResponse {
  results: {
    row_index: number;
    entity_id: number;
    display_id: string;
    result_row_id?: string;
    values?: Record<string, unknown>;
    schema_content_hash?: string;
  }[];
  errors: { row_index: number; message: string }[];
}

function columnType(id: string) {
  return ModRegistry.getInstance().getColumnType(id.toLowerCase());
}

function shape(column: GridColumn) {
  return column.type === "formula"
    ? (columnType(column.resultType ?? "text")?.operandShape ??
        column.resultType ??
        "text")
    : (columnType(column.type)?.operandShape ?? column.type);
}

function emptyValue(column: GridColumn): unknown {
  if (column.default !== undefined) return column.default;
  return columnType(column.type)?.defaultValue ?? "";
}

function snapshot(row: ResultTableRow, values: Record<string, unknown>) {
  return JSON.stringify({
    sourceEntityId: row.sourceEntityId,
    values: Object.keys(values)
      .sort()
      .reduce<Record<string, unknown>>((out, key) => {
        out[key] = values[key];
        return out;
      }, {}),
  });
}

function isCurrent(
  row: ResultTableRow,
  values: Record<string, unknown>,
  hash: string | null,
) {
  return (
    row.isRegistered &&
    row.entityId !== null &&
    !!hash &&
    row.lastRegisteredSchemaContentHash === hash &&
    row.lastRegisteredValueHash === snapshot(row, values) &&
    !row.registrationError
  );
}

function newResultRowId() {
  return globalThis.crypto?.randomUUID?.() ?? `result-row-${Date.now()}-${Math.random()}`;
}

type ResultStatus = "red" | "yellow" | "orange" | "blue" | "green";

const STATUS_COLORS: Record<ResultStatus, string> = {
  red: "var(--color-status-red)",
  yellow: "var(--color-status-yellow)",
  orange: "var(--color-status-orange)",
  blue: "var(--color-status-blue)",
  green: "var(--color-status-green)",
};

const STATUS_LABELS: Record<ResultStatus, string> = {
  red: "Registration error",
  yellow: "Schema has changed since last registration",
  orange: "Data changed since last registration",
  blue: "Not yet registered",
  green: "Registered, up to date",
};

function renderColumnTypeBadge(typeName: string) {
  const type = columnType(typeName);
  if (type) {
    const Icon = getColumnTypeIcon(type.icon);
    if (Icon) {
      const background = resolveColorHex(type.color || "muted");
      return (
        <span
          className="inline-flex items-center justify-center rounded"
          style={{
            backgroundColor: background,
            color: deriveForeground(background),
            width: 18,
            height: 18,
          }}
        >
          <Icon className="h-3 w-3" aria-label={type.displayName} />
        </span>
      );
    }
  }
  return typeName;
}

export function ResultTableContent({
  schemaId,
  schemaName,
  schemaContentHash,
  title,
  columns,
  rows,
  projectId,
  folderId,
  updateAttrs,
  readOnly = false,
  previewMode = false,
  workspaceId: sourceWorkspaceId,
}: ResultTableProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [schemaTypes, setSchemaTypes] = useState<EntityTypeSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [registering, setRegistering] = useState(false);
  const counter = useRef(rows.length + 1);

  const handleTitleBlur = useCallback(
    (event: React.FocusEvent<HTMLSpanElement>) => {
      const newTitle =
        event.currentTarget.textContent?.trim() || "Result Table";
      if (newTitle !== title) updateAttrs({ title: newTitle });
    },
    [title, updateAttrs],
  );

  const handleTitleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLSpanElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        event.currentTarget.blur();
      }
    },
    [],
  );
  const { triggerRef, panelRef, position } = usePickerPortal({
    open: pickerOpen,
    onClose: () => setPickerOpen(false),
  });
  const entityColumn = columns.find(
    (column) => column.name === "Entity" && column.type === "reference",
  );
  const valueColumns = columns.filter((column) => column !== entityColumn);
  const workspaceId =
    entityColumn?.referenceSchemaId !== undefined ||
    entityColumn?.referenceSchemaTypeId !== undefined
      ? sourceWorkspaceId
      : undefined;

  const applyRowValues = useCallback(
    (displayId: string, values: Record<string, unknown>) => {
      updateAttrs({
        rows: rows.map((row) =>
          row.displayId === displayId ? { ...row, values } : row,
        ),
      });
    },
    [rows, updateAttrs],
  );
  const {
    computedValues,
    backendOnlyColumns,
    refresh,
    isRefreshing,
    isStale,
    markRefreshed,
  } = useComputedFields({
    columns: valueColumns,
    enabled: !previewMode,
    applyRowValues,
  });

  const openPicker = useCallback(async () => {
    if (previewMode) return;
    setPickerOpen(true);
    if (schemaTypes.length) return;
    setLoading(true);
    try {
      const schemas = await get<EntityTypeSummary[]>("/schemas/");
      setSchemaTypes(
        schemas.filter(
          (item) =>
            item.is_active &&
            !item.is_default &&
            item.tags.includes("ResultTable"),
        ),
      );
    } catch {
      setSchemaTypes([]);
    } finally {
      setLoading(false);
    }
  }, [previewMode, schemaTypes.length]);

  const selectSchema = (schema: EntityTypeSummary) => {
    updateAttrs({
      schemaId: schema.id,
      schemaName: schema.name,
      schemaContentHash: schema.content_hash,
      columns: schema.columns,
      rows: [],
    });
    setPickerOpen(false);
  };

  const addRow = () => {
    updateAttrs({
      rows: [
        ...rows,
        {
          entityId: null,
          displayId: `#new-${counter.current++}`,
          resultRowId: newResultRowId(),
          sourceEntityId: "",
          values: Object.fromEntries(
            valueColumns.map((column) => [column.name, emptyValue(column)]),
          ),
          isRegistered: false,
          lastRegisteredValueHash: null,
          registrationError: null,
        },
      ],
    });
  };

  const updateRow = (displayId: string, change: Partial<ResultTableRow>) =>
    updateAttrs({
      rows: rows.map((row) =>
        row.displayId === displayId ? { ...row, ...change } : row,
      ),
    });
  const updateValue = (displayId: string, name: string, value: unknown) => {
    updateAttrs({
      rows: rows.map((row) => row.displayId === displayId
        ? { ...row, values: { ...row.values, [name]: value } }
        : row),
    });
  };

  const register = async () => {
    if (previewMode || schemaId === null || !schemaName || !entityColumn)
      return;
    const candidates = rows
      .map((row, index) => ({ row, index, values: computedValues(row) }))
      .filter(({ row, values }) => !isCurrent(row, values, schemaContentHash));
    const next = [...rows];
    candidates
      .filter(({ row }) => !row.sourceEntityId.trim())
      .forEach(({ index, row }) => {
        next[index] = { ...row, registrationError: "Entity is required." };
      });
    const pending = candidates.filter(({ row }) => row.sourceEntityId.trim());
    if (!pending.length) {
      if (candidates.length) updateAttrs({ rows: next });
      return;
    }
    setRegistering(true);
    try {
      const response = await post<BatchResponse>(
        "/lims/entities/batch-register/",
        {
          schema_id: schemaId,
          project_id: projectId ?? null,
          rows: pending.map(({ row }) => ({
            entity_id: row.entityId,
            result_row_id: row.resultRowId ?? newResultRowId(),
            name: `${row.sourceEntityId} — ${schemaName}`,
            values: {
              ...Object.fromEntries(
                Object.entries(row.values).filter(
                  ([name]) =>
                    !valueColumns.some(
                      (column) =>
                        column.name === name && column.type === "formula",
                    ),
                ),
              ),
              Entity: row.sourceEntityId,
            },
          })),
        },
      );
      response.results.forEach((result) => {
        const item = pending[result.row_index];
        if (!item) return;
        const registeredValues = {
          ...item.row.values,
          ...(result.values ?? {}),
        };
        next[item.index] = {
          ...item.row,
          resultRowId: item.row.resultRowId ?? result.result_row_id,
          values: registeredValues,
          entityId: result.entity_id,
          displayId: result.display_id,
          isRegistered: true,
          lastRegisteredValueHash: snapshot(item.row, registeredValues),
          lastRegisteredSchemaContentHash:
            result.schema_content_hash ?? schemaContentHash,
          registrationError: null,
        };
        markRefreshed(result.display_id, registeredValues);
      });
      response.errors.forEach((error) => {
        const item = pending[error.row_index];
        if (item)
          next[item.index] = { ...item.row, registrationError: error.message };
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Registration failed";
      pending.forEach(({ index, row }) => {
        next[index] = { ...row, registrationError: message };
      });
    }
    updateAttrs({ rows: next });
    setRegistering(false);
  };

  if (schemaId === null)
    return (
      <div
        className="rounded-lg border border-hairline bg-background p-4"
        data-testid="result-table-placeholder"
      >
        <div className="flex items-center gap-2.5">
          <Database className="h-5 w-5" aria-hidden="true" />
          <span className="text-sm font-medium">{title}</span>
        </div>
        <button
          ref={triggerRef}
          type="button"
          className="mt-3 rounded-md border border-hairline px-3 py-1.5 text-sm"
          onClick={openPicker}
          data-testid="result-load-schema-btn"
        >
          Load Result Schema
        </button>
        {pickerOpen && (
          <PickerPortal
            position={position}
            panelRef={panelRef}
            testId="result-schema-picker"
          >
            {loading ? (
              <div className="p-3">
                <Loader className="h-4 w-4" />
              </div>
            ) : schemaTypes.length ? (
              schemaTypes.map((schema) => (
                <button
                  key={schema.id}
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm"
                  onClick={() => selectSchema(schema)}
                  data-testid={`result-schema-option-${schema.id}`}
                >
                  {schema.name}
                </button>
              ))
            ) : (
              <div className="p-3 text-sm">No result schemas available.</div>
            )}
          </PickerPortal>
        )}
      </div>
    );

  return (
    <TableChrome
      className="w-full table-layout-chrome--compact"
      data-layout="dynamic-bleed"
      data-testid="result-table-loaded"
      title={
        <span className="inline-flex items-center gap-2">
          <ChartColumn
            className="h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          {readOnly ? (
            <span data-testid="result-table-title">{title}</span>
          ) : (
            <span
              className="outline-none focus:outline-none"
              contentEditable
              suppressContentEditableWarning
              onBlur={handleTitleBlur}
              onKeyDown={handleTitleKeyDown}
              data-testid="result-table-title"
            >
              {title}
            </span>
          )}
          <span className="text-xs font-normal text-muted-foreground">
            {schemaName}
          </span>
        </span>
      }
      toolbar={
        !readOnly && (
          <IconButton
            onClick={register}
            disabled={registering || previewMode}
            aria-label="Register results"
            title="Register results"
            variant="primary"
            size="sm"
            className="table-layout-register-button"
            data-testid="result-register-btn"
          >
            {registering ? (
              <Loader
                className="h-4 w-4 shrink-0"
                style={{ width: "1rem", height: "1rem", flexShrink: 0 }}
              />
            ) : (
              <Upload
                className="h-4 w-4 shrink-0"
                aria-hidden="true"
                style={{ width: "1rem", height: "1rem", flexShrink: 0 }}
              />
            )}
          </IconButton>
        )
      }
      addRow={
        !readOnly && (
          <Button
            variant="ghost"
            size="sm"
            onClick={addRow}
            data-testid="result-add-row-btn"
          >
            <Plus className="h-3 w-3" /> New Row
          </Button>
        )
      }
    >
      <TableKit
        columns={[
          {
            header: "Entity",
            shape: "entity-picker",
            referenceSchemaId: entityColumn?.referenceSchemaId,
            referenceSchemaTypeId: entityColumn?.referenceSchemaTypeId,
            workspaceId,
            width: "10rem",
            cellTestId: (_, index) => `result-entity-cell-${rows[index]?.displayId}`,
          },
          ...valueColumns.map((column) => ({
            header: (
              <>
                {column.name}
                <span className="ml-1 inline-flex items-center text-2xs text-muted-foreground font-normal align-middle">
                  {renderColumnTypeBadge(column.type)}
                </span>
              </>
            ),
            shape: shape(column),
            placeholder: backendOnlyColumns.includes(column)
              ? "Refresh to calculate"
              : undefined,
            width: "10rem",
            cellTestId: (_, index) => `result-cell-${rows[index]?.displayId}-${column.name}`,
          })),
        ]}
        rows={rows.map((row) => [
          row.sourceEntityId,
          ...valueColumns.map((column) => {
            const value = computedValues(row)[column.name];
            return value === undefined || value === null || value === "" ? null : value;
          }),
        ])}
        tableId="result-table"
        readOnly={readOnly}
        isCellReadOnly={(position) =>
          position.column === 0
            ? rows[position.row]?.isRegistered === true
            : valueColumns[position.column - 1]?.type === "formula"
        }
        onEdit={(position, value) => {
          const row = rows[position.row];
          if (!row) return;
          if (position.column === 0) {
            updateRow(row.displayId, { sourceEntityId: String(value ?? "") });
          } else {
            const column = valueColumns[position.column - 1];
            if (column) updateValue(row.displayId, column.name, value);
          }
        }}
        getCellProps={(_, rowIndex, position) => {
          if (position.column === 0) return {};
          const column = valueColumns[position.column - 1];
          return column && isStale(rows[rowIndex], column.name)
            ? { className: "opacity-50", "data-stale": "true" }
            : {};
        }}
        onClear={(positions) => {
          const cleared = rows.map((row, rowIndex) => {
            const values = { ...row.values };
            positions
              .filter((position) => position.row === rowIndex && position.column > 0)
              .forEach((position) => {
                const column = valueColumns[position.column - 1];
                if (column) values[column.name] = "";
              });
            return { ...row, values };
          });
          updateAttrs({ rows: cleared });
        }}
        onPaste={(anchor, pasted) => {
          const nextRows = rows.map((row, rowIndex) => {
            const line = pasted[rowIndex - anchor.row];
            if (!line || rowIndex < anchor.row) return row;
            const values = { ...row.values };
            let source = row.sourceEntityId;
            line.forEach((value, offset) => {
              if (value === undefined) return;
              const index = anchor.column + offset;
              if (index === 0 && !row.isRegistered) {
                source = String(value ?? "");
              } else if (index > 0) {
                const column = valueColumns[index - 1];
                if (column && column.type !== "formula") values[column.name] = value;
              }
            });
            return { ...row, sourceEntityId: source, values };
          });
          updateAttrs({ rows: nextRows });
        }}
        leadingHeader={<span aria-label="Status" />}
        renderLeadingCell={(_, rowIndex) => {
          const row = rows[rowIndex];
          const values = computedValues(row);
          const current = isCurrent(row, values, schemaContentHash);
          const status: ResultStatus = row.registrationError
            ? "red"
            : !row.isRegistered
              ? "blue"
              : !schemaContentHash || row.lastRegisteredSchemaContentHash !== schemaContentHash
                ? "yellow"
                : current
                  ? "green"
                  : "orange";
          return (
            <div
              className="absolute left-0 top-0 bottom-0 w-[3px]"
              style={{ backgroundColor: STATUS_COLORS[status] }}
              title={STATUS_LABELS[status]}
              aria-label={STATUS_LABELS[status]}
              data-testid={`result-status-bar-${status}`}
            />
          );
        }}
        trailingHeader={!readOnly ? "" : undefined}
          renderTrailingCell={!readOnly ? (_, rowIndex) => {
          const row = rows[rowIndex];
          return (
            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
              <MoreActions
                items={[
                  {
                    key: "refresh",
                    icon: RefreshCw,
                    label: "Refresh",
                    disabled: isRefreshing(row.displayId),
                    onClick: () => refresh(row),
                    tooltip: `Refresh computed fields for ${row.displayId}`,
                  },
                  {
                    key: "delete",
                    icon: Trash2,
                    label: "Delete",
                    destructive: true,
                    onClick: async () => {
                      if (row.entityId !== null) await del(`/lims/entities/${row.entityId}/`);
                      updateAttrs({ rows: rows.filter((item) => item.displayId !== row.displayId) });
                    },
                  },
                ].filter((item) => item.key !== "refresh" || backendOnlyColumns.length > 0)}
              />
            </div>
          );
          } : undefined}
        getRowProps={(_, rowIndex) => ({
          className: "hover:bg-[var(--color-background-hover)] transition-colors group",
          "data-testid": `result-table-row-${rows[rowIndex]?.displayId}`,
        })}
        data-testid="result-table-grid"
      />
    </TableChrome>
  );
}

export const ResultTableBlockComponent = createBlockAdapter(
  ResultTableContent,
  ({ instance, context }) => {
    const attrs = instance.attrs as Record<string, unknown>;
    const entryContext = context.entry as ElnSidebarData | undefined;
    const slotContext = context as typeof context & {
      folderId?: number | null;
      projectId?: number | null;
    };
    const projectId =
      entryContext?.projectId ??
      entryContext?.entry?.project ??
      slotContext.projectId ??
      null;
  const folderId = entryContext?.folderId ?? slotContext.folderId ?? null;
    return {
      schemaId: (attrs.schemaId as number | null) ?? null,
      schemaName: (attrs.schemaName as string | null) ?? null,
      schemaContentHash: (attrs.schemaContentHash as string | null) ?? null,
      title: (attrs.title as string) || "Result Table",
      columns: (attrs.columns as GridColumn[]) ?? [],
      rows: (attrs.rows as ResultTableRow[]) ?? [],
      projectId,
      folderId,
      updateAttrs: instance.updateAttrs,
      readOnly: context.viewMode === "view",
      previewMode: context.viewMode === "prototype",
      workspaceId: context.workspaceId,
    };
  },
);
