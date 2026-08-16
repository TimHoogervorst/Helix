import { useCallback, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";

export interface TablePosition {
  row: number;
  column: number;
}

export interface TableRange {
  start: TablePosition;
  end: TablePosition;
}

export function normalizeTableRange(range: TableRange): TableRange {
  return {
    start: {
      row: Math.min(range.start.row, range.end.row),
      column: Math.min(range.start.column, range.end.column),
    },
    end: {
      row: Math.max(range.start.row, range.end.row),
      column: Math.max(range.start.column, range.end.column),
    },
  };
}

export function tableRangeToTsv(values: string[][], range: TableRange): string {
  const normalized = normalizeTableRange(range);
  const serialize = (value: string) => /["\t\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  return values
    .slice(normalized.start.row, normalized.end.row + 1)
    .map((row) => row.slice(normalized.start.column, normalized.end.column + 1).map(serialize).join("\t"))
    .join("\n");
}

export function parseTableTsv(text: string): string[][] {
  if (!text) return [];
  const rows: string[][] = [[]];
  let value = "";
  let quoted = false;
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === '"') {
      if (quoted && normalized[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "\t" && !quoted) {
      rows[rows.length - 1]?.push(value);
      value = "";
    } else if (character === "\n" && !quoted) {
      rows[rows.length - 1]?.push(value);
      rows.push([]);
      value = "";
    } else {
      value += character;
    }
  }
  rows[rows.length - 1]?.push(value);
  return rows;
}

function samePosition(left: TablePosition, right: TablePosition) {
  return left.row === right.row && left.column === right.column;
}

interface TableInteractionOptions {
  tableId?: string;
  rowCount: number;
  columnCount: number;
  getValues: () => string[][];
  onPaste: (anchor: TablePosition, values: string[][]) => void;
}

export function useTableInteraction({
  tableId = "",
  rowCount,
  columnCount,
  getValues,
  onPaste,
}: TableInteractionOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeCell, setActiveCell] = useState<TablePosition>({ row: 0, column: 0 });
  const [selectionAnchor, setSelectionAnchor] = useState<TablePosition>({ row: 0, column: 0 });
  const [editingCell, setEditingCell] = useState<TablePosition | null>(null);
  const hoveredCellRef = useRef<TablePosition | null>(null);
  const cellKey = (position: TablePosition) => tableId ? `${tableId}:${position.row}:${position.column}` : `${position.row}:${position.column}`;

  const focusCell = useCallback((position: TablePosition) => {
    const cell = containerRef.current?.querySelector<HTMLElement>(
      `[data-table-cell="${cellKey(position)}"]`,
    );
    cell?.focus();
  }, [tableId]);

  const moveTo = useCallback((position: TablePosition, extendSelection = false) => {
    const bounded = {
      row: Math.max(0, Math.min(rowCount - 1, position.row)),
      column: Math.max(0, Math.min(columnCount - 1, position.column)),
    };
    setActiveCell(bounded);
    if (!extendSelection) setSelectionAnchor(bounded);
    focusCell(bounded);
  }, [columnCount, focusCell, rowCount]);

  const activateCell = useCallback((position: TablePosition, edit = true) => {
    setActiveCell(position);
    setSelectionAnchor(position);
    focusCell(position);
    if (edit) setEditingCell(position);
  }, [focusCell]);

  const finishEditing = useCallback(() => setEditingCell(null), []);
  const cancelEditing = useCallback((position: TablePosition) => {
    setEditingCell(null);
    focusCell(position);
  }, [focusCell]);

  const handleCellKeyDown = useCallback((position: TablePosition, event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter") {
      // Enter the cell under the mouse if there is one, else the focused cell.
      event.preventDefault();
      activateCell(hoveredCellRef.current ?? position);
      return;
    }
    const delta = event.key === "ArrowUp" ? { row: -1, column: 0 }
      : event.key === "ArrowDown" ? { row: 1, column: 0 }
        : event.key === "ArrowLeft" ? { row: 0, column: -1 }
          : event.key === "ArrowRight" ? { row: 0, column: 1 }
            : event.key === "Tab" ? { row: 0, column: event.shiftKey ? -1 : 1 }
              : null;
    if (!delta) return;
    event.preventDefault();
    // Keyboard navigation takes ownership of the cursor from the mouse.
    hoveredCellRef.current = null;
    moveTo({ row: position.row + delta.row, column: position.column + delta.column }, event.shiftKey && event.key.startsWith("Arrow"));
  }, [activateCell, moveTo]);

  const handleEditorKeyDown = useCallback((
    position: TablePosition,
    event: KeyboardEvent<HTMLElement>,
    actions: { commit: () => void; cancel: () => void },
  ) => {
    if (event.key === "Enter") {
      event.preventDefault();
      actions.commit();
      finishEditing();
      moveTo({ row: position.row + 1, column: position.column });
    } else if (event.key === "Tab") {
      event.preventDefault();
      actions.commit();
      finishEditing();
      moveTo({ row: position.row, column: position.column + (event.shiftKey ? -1 : 1) });
    } else if (event.key === "Escape") {
      event.preventDefault();
      actions.cancel();
      cancelEditing(position);
    }
  }, [cancelEditing, finishEditing, moveTo]);

  const handleCopy = useCallback((event: ClipboardEvent<HTMLElement>) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
    event.preventDefault();
    event.clipboardData.setData("text/plain", tableRangeToTsv(getValues(), {
      start: selectionAnchor,
      end: activeCell,
    }));
  }, [activeCell, getValues, selectionAnchor]);

  const handlePaste = useCallback((event: ClipboardEvent<HTMLElement>) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
    event.preventDefault();
    const values = parseTableTsv(event.clipboardData.getData("text/plain"));
    if (values.length > 0) onPaste(activeCell, values);
  }, [activeCell, onPaste]);

  const cellProps = useCallback((position: TablePosition) => ({
    "data-table-cell": cellKey(position),
    tabIndex: samePosition(activeCell, position) ? 0 : -1,
    "aria-selected": samePosition(activeCell, position),
    onClick: () => activateCell(position),
    onMouseEnter: () => { hoveredCellRef.current = position; },
    onMouseLeave: () => { hoveredCellRef.current = null; },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => handleCellKeyDown(position, event),
  }), [activateCell, activeCell, handleCellKeyDown, tableId]);

  return {
    containerRef,
    activeCell,
    editingCell,
    selectionAnchor,
    activateCell,
    moveTo,
    finishEditing,
    cancelEditing,
    handleEditorKeyDown,
    cellProps,
    handleCopy,
    handlePaste,
  };
}
