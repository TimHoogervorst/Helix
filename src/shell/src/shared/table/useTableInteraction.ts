import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";

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
  onClear: (positions: TablePosition[]) => void;
  readOnly?: boolean;
}

export function useTableInteraction({
  tableId = "",
  rowCount,
  columnCount,
  getValues,
  onPaste,
  onClear,
  readOnly = false,
}: TableInteractionOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeCell, setActiveCell] = useState<TablePosition>({ row: 0, column: 0 });
  const [selectionAnchor, setSelectionAnchor] = useState<TablePosition>({ row: 0, column: 0 });
  const [selectedCells, setSelectedCells] = useState<Set<string>>(() => new Set());
  const [editingCell, setEditingCell] = useState<TablePosition | null>(null);
  const [editingDraft, setEditingDraft] = useState<string | null>(null);
  const [tableIsActive, setTableIsActive] = useState(false);
  const hoveredCellRef = useRef<TablePosition | null>(null);
  const dragRef = useRef<{ anchor: TablePosition; last: TablePosition; moved: boolean; active: boolean } | null>(null);
  const suppressClickRef = useRef<TablePosition | null>(null);
  const cellKey = (position: TablePosition) => tableId ? `${tableId}:${position.row}:${position.column}` : `${position.row}:${position.column}`;

  const boundPosition = useCallback((position: TablePosition) => ({
    row: Math.max(0, Math.min(rowCount - 1, position.row)),
    column: Math.max(0, Math.min(columnCount - 1, position.column)),
  }), [columnCount, rowCount]);

  useEffect(() => {
    setActiveCell((current) => {
      const bounded = boundPosition(current);
      return samePosition(current, bounded) ? current : bounded;
    });
    setSelectionAnchor((current) => {
      const bounded = boundPosition(current);
      return samePosition(current, bounded) ? current : bounded;
    });
    setSelectedCells((current) => {
      const next = new Set<string>();
      for (const key of current) {
        const parts = key.split(":");
        const row = Number(parts[parts.length - 2]);
        const column = Number(parts[parts.length - 1]);
        if (Number.isInteger(row) && Number.isInteger(column)
          && row >= 0 && row < rowCount && column >= 0 && column < columnCount) {
          next.add(key);
        }
      }
      if (current.size > 0 && next.size === 0) {
        const bounded = boundPosition(activeCell);
        next.add(tableId ? `${tableId}:${bounded.row}:${bounded.column}` : `${bounded.row}:${bounded.column}`);
      }
      if (next.size === current.size && [...next].every((key) => current.has(key))) return current;
      return next;
    });
  }, [activeCell, boundPosition, columnCount, rowCount, tableId]);

  const selectRange = useCallback((anchor: TablePosition, target: TablePosition) => {
    const range = normalizeTableRange({ start: anchor, end: target });
    const next = new Set<string>();
    for (let row = range.start.row; row <= range.end.row; row += 1) {
      for (let column = range.start.column; column <= range.end.column; column += 1) {
        next.add(cellKey({ row, column }));
      }
    }
    setSelectedCells(next);
    setActiveCell(target);
    setTableIsActive(true);
  }, [tableId]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !containerRef.current?.contains(target)) {
        setTableIsActive(false);
        setSelectedCells(new Set());
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    const handleMouseUp = () => {
      const drag = dragRef.current;
      if (!drag) return;
      if (drag.moved) suppressClickRef.current = drag.last;
      dragRef.current = null;
    };
    const handleSelectStart = (event: Event) => {
      if (dragRef.current?.active) event.preventDefault();
    };

    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("selectstart", handleSelectStart);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("selectstart", handleSelectStart);
    };
  }, []);

  const focusCell = useCallback((position: TablePosition) => {
    const cell = containerRef.current?.querySelector<HTMLElement>(
      `[data-table-cell="${cellKey(position)}"]`,
    );
    cell?.focus();
  }, [tableId]);

  const moveTo = useCallback((position: TablePosition, extendSelection = false) => {
    const bounded = boundPosition(position);
    setActiveCell(bounded);
    setTableIsActive(true);
    if (extendSelection) {
      selectRange(selectionAnchor, bounded);
    } else {
      setSelectionAnchor(bounded);
      setSelectedCells(new Set([cellKey(bounded)]));
    }
    focusCell(bounded);
  }, [boundPosition, focusCell, rowCount, selectionAnchor, selectRange, tableId]);

  const selectCell = useCallback((position: TablePosition) => {
    const bounded = boundPosition(position);
    if (tableIsActive && samePosition(activeCell, bounded) && selectedCells.has(cellKey(bounded))) return;
    setActiveCell(bounded);
    setSelectionAnchor(bounded);
    setSelectedCells(new Set([cellKey(bounded)]));
    setTableIsActive(true);
    focusCell(bounded);
  }, [activeCell, boundPosition, focusCell, selectedCells, tableIsActive, tableId]);

  const handleCellMouseDown = useCallback((position: TablePosition, event: ReactMouseEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const bounded = boundPosition(position);
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      dragRef.current = null;
      setEditingCell(null);
      return;
    }
    dragRef.current = { anchor: bounded, last: bounded, moved: false, active: true };
    setEditingCell(null);
    setActiveCell(bounded);
    setSelectionAnchor(bounded);
    setSelectedCells(new Set([cellKey(bounded)]));
    setTableIsActive(true);
    focusCell(bounded);
  }, [boundPosition, focusCell, tableId]);

  const handleCellMouseEnter = useCallback((position: TablePosition) => {
    hoveredCellRef.current = position;
    const drag = dragRef.current;
    if (!drag?.active) return;
    const bounded = boundPosition(position);
    if (samePosition(drag.anchor, bounded)) return;
    drag.moved = true;
    drag.last = bounded;
    selectRange(drag.anchor, bounded);
  }, [boundPosition, selectRange]);

  const handleCellClick = useCallback((position: TablePosition, event?: ReactMouseEvent<HTMLElement>) => {
    if (suppressClickRef.current && samePosition(suppressClickRef.current, position)) {
      suppressClickRef.current = null;
      event?.preventDefault();
      event?.stopPropagation();
      return;
    }
    suppressClickRef.current = null;
    const bounded = boundPosition(position);
    if (event?.shiftKey) {
      selectRange(selectionAnchor, bounded);
      focusCell(bounded);
      return;
    }
    if (event?.ctrlKey || event?.metaKey) {
      setActiveCell(bounded);
      setSelectedCells((current) => {
        const next = new Set(current);
        const key = cellKey(bounded);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      setTableIsActive(true);
      focusCell(bounded);
      return;
    }
    selectCell(position);
  }, [boundPosition, focusCell, selectCell, selectionAnchor, selectRange, tableId]);

  const activateCell = useCallback((position: TablePosition, edit = true, emptyDraft = false) => {
    setActiveCell(position);
    setTableIsActive(true);
    setSelectionAnchor(position);
    setSelectedCells(new Set([cellKey(position)]));
    focusCell(position);
    setEditingDraft(emptyDraft ? "" : null);
    setEditingCell(edit ? position : null);
  }, [focusCell, tableId]);

  const finishEditing = useCallback(() => {
    setEditingCell(null);
    setEditingDraft(null);
  }, []);
  const cancelEditing = useCallback((position: TablePosition) => {
    setEditingCell(null);
    setEditingDraft(null);
    focusCell(position);
  }, [focusCell]);

  const handleCellKeyDown = useCallback((position: TablePosition, event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter") {
      event.preventDefault();
      activateCell(position);
      return;
    }
    if (event.key === "F2") {
      event.preventDefault();
      activateCell(position);
      return;
    }
    const isControlGesture = event.ctrlKey || event.metaKey;
    if (isControlGesture && event.key.toLowerCase() === "a") {
      event.preventDefault();
      const next = new Set<string>();
      for (let row = 0; row < rowCount; row += 1) {
        for (let column = 0; column < columnCount; column += 1) {
          next.add(cellKey({ row, column }));
        }
      }
      setSelectedCells(next);
      setTableIsActive(true);
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      if (readOnly) return;
      const positions: TablePosition[] = [];
      const keys = event.key === "Backspace"
        ? new Set([cellKey(position)])
        : selectedCells.size ? selectedCells : new Set([cellKey(position)]);
      for (const key of keys) {
        const [row, column] = key.split(":").slice(tableId ? 1 : 0).map(Number);
        positions.push({ row, column });
      }
      onClear(positions);
      if (event.key === "Backspace") activateCell(position, true, true);
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
    if (isControlGesture && event.key.startsWith("Arrow")) {
      const bounded = boundPosition({ row: position.row + delta.row, column: position.column + delta.column });
      setActiveCell(bounded);
      setSelectedCells((current) => new Set(current).add(cellKey(bounded)));
      setTableIsActive(true);
      focusCell(bounded);
      return;
    }
    moveTo({ row: position.row + delta.row, column: position.column + delta.column }, event.shiftKey && event.key.startsWith("Arrow"));
  }, [activateCell, boundPosition, columnCount, focusCell, moveTo, onClear, readOnly, rowCount, selectedCells, tableId]);

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
    const values = getValues();
    const selectedPositions: TablePosition[] = [];
    for (let row = 0; row < rowCount; row += 1) {
      for (let column = 0; column < columnCount; column += 1) {
        if (selectedCells.has(cellKey({ row, column }))) {
          selectedPositions.push({ row, column });
        }
      }
    }
    const positions = selectedPositions.length > 0
      ? selectedPositions
      : [selectionAnchor, activeCell];
    const start = {
      row: Math.min(...positions.map(({ row }) => row)),
      column: Math.min(...positions.map(({ column }) => column)),
    };
    const end = {
      row: Math.max(...positions.map(({ row }) => row)),
      column: Math.max(...positions.map(({ column }) => column)),
    };
    const serialized = values
      .slice(start.row, end.row + 1)
      .map((row, rowIndex) => row
        .slice(start.column, end.column + 1)
        .map((value, columnIndex) => {
          const position = { row: start.row + rowIndex, column: start.column + columnIndex };
          return selectedCells.size === 0 || selectedCells.has(cellKey(position)) ? value : "";
        })
        .map((value) => /["\t\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)
        .join("\t"))
      .join("\n");
    event.clipboardData.setData("text/plain", serialized);
  }, [activeCell, columnCount, getValues, rowCount, selectedCells, selectionAnchor, tableId]);

  const handlePaste = useCallback((event: ClipboardEvent<HTMLElement>) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
    if (readOnly) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    const values = parseTableTsv(event.clipboardData.getData("text/plain"));
    if (values.length === 0) return;
    const anchor = boundPosition(activeCell);
    const clampedValues = values
      .slice(0, rowCount - anchor.row)
      .map((row) => row.slice(0, columnCount - anchor.column));
    onPaste(anchor, clampedValues);
    const pastedRowCount = clampedValues.length;
    const pastedColumnCount = Math.max(...clampedValues.map((row) => row.length), 0);
    if (pastedRowCount > 0 && pastedColumnCount > 0) {
      const end = {
        row: anchor.row + pastedRowCount - 1,
        column: anchor.column + pastedColumnCount - 1,
      };
      setSelectionAnchor(anchor);
      selectRange(anchor, end);
      setActiveCell(anchor);
      focusCell(anchor);
    }
  }, [activeCell, boundPosition, columnCount, focusCell, onPaste, readOnly, rowCount, selectRange]);

  const cellProps = useCallback((position: TablePosition) => ({
    "data-table-cell": cellKey(position),
    tabIndex: samePosition(activeCell, position) ? 0 : -1,
    "aria-selected": tableIsActive && selectedCells.has(cellKey(position)),
    "data-table-active": tableIsActive && samePosition(activeCell, position) ? "true" : undefined,
    onMouseDown: (event: ReactMouseEvent<HTMLElement>) => handleCellMouseDown(position, event),
    onClick: (event: ReactMouseEvent<HTMLElement>) => handleCellClick(position, event),
    onDoubleClick: () => activateCell(position),
    onFocus: () => setTableIsActive(true),
    onMouseEnter: () => handleCellMouseEnter(position),
    onMouseLeave: () => { hoveredCellRef.current = null; },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => handleCellKeyDown(position, event),
  }), [activateCell, activeCell, handleCellClick, handleCellKeyDown, handleCellMouseDown, handleCellMouseEnter, selectedCells, tableId, tableIsActive]);

  return {
    containerRef,
    activeCell,
    editingCell,
    editingDraft,
    selectionAnchor,
    selectedCells,
    selectCell,
    handleCellClick,
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
