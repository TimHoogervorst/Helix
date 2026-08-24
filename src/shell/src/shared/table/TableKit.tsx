import type { ReactNode } from "react";
import {
  TypedFullCell,
  parseCellValue,
  renderCellValue,
  type TableCellValue,
} from "./TableCells";
import { TableScroll } from "./TableLayout";
import {
  useTableInteraction,
  type TablePosition,
} from "./useTableInteraction";

export interface TableKitColumn {
  header: ReactNode;
  shape: string;
  options?: string[];
  referenceSchemaId?: number;
  referenceSchemaTypeId?: number;
  workspaceId?: string;
  placeholder?: string;
  width?: string;
  cellTestId?: (row: unknown[], index: number) => string | undefined;
}

export interface TableKitProps {
  columns: TableKitColumn[];
  rows: unknown[][];
  tableId?: string;
  readOnly?: boolean;
  isCellReadOnly?: (position: TablePosition) => boolean;
  onEdit?: (position: TablePosition, value: TableCellValue) => void;
  onPaste?: (anchor: TablePosition, values: (TableCellValue | undefined)[][]) => void;
  onClear?: (positions: TablePosition[]) => void;
  leadingHeader?: ReactNode;
  renderLeadingCell?: (row: unknown[], index: number) => ReactNode;
  trailingHeader?: ReactNode;
  renderTrailingCell?: (row: unknown[], index: number) => ReactNode;
  getRowProps?: (row: unknown[], index: number) => {
    className?: string;
    "data-testid"?: string;
  };
  getCellProps?: (row: unknown[], index: number, position: TablePosition) => {
    className?: string;
    "data-stale"?: string;
  };
  emptyState?: ReactNode;
  className?: string;
  "data-testid"?: string;
  "data-bleed-role"?: string;
}

export function TableKit({
  columns,
  rows,
  tableId = "table-kit",
  readOnly = false,
  isCellReadOnly,
  onEdit,
  onPaste,
  onClear,
  leadingHeader,
  renderLeadingCell,
  trailingHeader,
  renderTrailingCell,
  getRowProps,
  getCellProps,
  emptyState,
  className = "",
  "data-testid": testId,
  "data-bleed-role": bleedRole,
}: TableKitProps) {
  const interaction = useTableInteraction({
    tableId,
    rowCount: rows.length,
    columnCount: columns.length,
    readOnly,
    isCellReadOnly,
    getValues: () => rows.map((row) =>
      columns.map((column, columnIndex) =>
        renderCellValue(column.shape, row[columnIndex]),
      ),
    ),
    onPaste: (anchor, rawValues) => {
      const values = rawValues.map((rawRow, rowOffset) =>
        rawRow.map((raw, columnOffset) => {
          const position = {
            row: anchor.row + rowOffset,
            column: anchor.column + columnOffset,
          };
          if (isCellReadOnly?.(position)) return undefined;
          const column = columns[position.column];
          if (!column) return undefined;
          try {
            return parseCellValue(column.shape, raw);
          } catch {
            return undefined;
          }
        }),
      );
      onPaste?.(anchor, values);
    },
    onClear: (positions) => {
      onClear?.(positions);
    },
  });

  return (
    <TableScroll className={className} data-bleed-role={bleedRole}>
        <div
          ref={interaction.containerRef}
          className="w-max min-w-full"
          onCopy={interaction.handleCopy}
          onPaste={interaction.handlePaste}
        >
          <table className="min-w-full" data-testid={testId}>
            <colgroup>
              {leadingHeader !== undefined && <col style={{ width: "2.5rem" }} />}
              {columns.map((column, index) => (
                <col key={index} style={column.width ? { width: column.width } : undefined} />
              ))}
              {trailingHeader !== undefined && <col style={{ width: "2.5rem" }} />}
            </colgroup>
            <thead>
              <tr className="border-b border-hairline bg-surface text-left font-[var(--font-label)] text-2xs uppercase tracking-widest text-muted-foreground">
                {leadingHeader !== undefined && (
                  <th className="px-2 py-1 whitespace-nowrap">{leadingHeader}</th>
                )}
                {columns.map((column, columnIndex) => (
                  <th key={columnIndex} className="px-4 py-1 text-left font-medium whitespace-nowrap">
                    {column.header}
                  </th>
                ))}
                {trailingHeader !== undefined && <th className="table-layout-action table-layout-action--header">{trailingHeader}</th>}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && emptyState ? (
                <tr>
                  <td colSpan={columns.length + (leadingHeader !== undefined ? 1 : 0) + (trailingHeader !== undefined ? 1 : 0)}>
                    {emptyState}
                  </td>
                </tr>
              ) : rows.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className={`border-b border-hairline last:border-b-0 ${getRowProps?.(row, rowIndex)?.className ?? ""}`}
                  data-testid={getRowProps?.(row, rowIndex)?.["data-testid"]}
                >
                  {leadingHeader !== undefined && renderLeadingCell && <td className="relative px-2 py-1 text-center align-middle">{renderLeadingCell(row, rowIndex)}</td>}
                  {columns.map((column, columnIndex) => {
                    const position = { row: rowIndex, column: columnIndex };
                    const cellReadOnly = readOnly || isCellReadOnly?.(position) === true;
                    return (
                      <td
                        key={columnIndex}
                        className={`p-0 ${getCellProps?.(row, rowIndex, position)?.className ?? ""}`}
                        data-stale={getCellProps?.(row, rowIndex, position)?.["data-stale"]}
                        {...interaction.cellProps(position)}
                      >
                        <TypedFullCell
                          shape={column.shape}
                          value={row[columnIndex]}
                          onCommit={(value) => onEdit?.(position, value)}
                          position={position}
                          interaction={interaction}
                          readOnly={cellReadOnly}
                          options={column.options}
                          referenceSchemaId={column.referenceSchemaId}
                          referenceSchemaTypeId={column.referenceSchemaTypeId}
                          workspaceId={column.workspaceId}
                          placeholder={column.placeholder}
                          data-testid={column.cellTestId?.(row, rowIndex) ?? (testId ? `${testId}-cell-${rowIndex}-${columnIndex}` : undefined)}
                        />
                      </td>
                    );
                  })}
                  {trailingHeader !== undefined && renderTrailingCell && <td className="table-layout-action">{renderTrailingCell(row, rowIndex)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TableScroll>
  );
}
