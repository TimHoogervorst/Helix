import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TableKit } from "../TableKit";

const columns = [
  { header: "Name", shape: "text" },
  { header: "Amount", shape: "number" },
];

function renderKit(tableId = "kit", rows = [["Sample", 10], ["Second", 20]]) {
  return render(
    <>
      <TableKit tableId={tableId} columns={columns} rows={rows} data-testid={`${tableId}-grid`} />
      <div data-testid={`${tableId}-outside`}>Outside</div>
    </>,
  );
}

describe("TableKit", () => {
  it("does not select a cell on initial render and clears on outside click", () => {
    renderKit();
    const cell = document.querySelector('[data-table-cell="kit:0:0"]');
    expect(cell).toHaveAttribute("aria-selected", "false");

    fireEvent.click(cell!);
    expect(cell).toHaveAttribute("aria-selected", "true");
    fireEvent.pointerDown(screen.getByTestId("kit-outside"));
    expect(cell).toHaveAttribute("aria-selected", "false");
  });

  it("clears selection when another TableKit is selected", () => {
    render(
      <>
        <TableKit tableId="first" columns={columns} rows={[["A", 1]]} />
        <TableKit tableId="second" columns={columns} rows={[["B", 2]]} />
      </>,
    );
    const first = document.querySelector('[data-table-cell="first:0:0"]')!;
    const second = document.querySelector('[data-table-cell="second:0:0"]')!;
    fireEvent.click(first);
    fireEvent.pointerDown(second);
    fireEvent.click(second);
    expect(first).toHaveAttribute("aria-selected", "false");
    expect(second).toHaveAttribute("aria-selected", "true");
  });

  it("navigates with arrows and selects a dragged range", () => {
    renderKit();
    const first = document.querySelector('[data-table-cell="kit:0:0"]')!;
    const second = document.querySelector('[data-table-cell="kit:0:1"]')!;
    const lower = document.querySelector('[data-table-cell="kit:1:1"]')!;

    fireEvent.click(first);
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(document.activeElement).toBe(second);

    fireEvent.mouseDown(second, { button: 0 });
    fireEvent.mouseEnter(lower);
    fireEvent.mouseUp(document);
    expect(second).toHaveAttribute("aria-selected", "true");
    expect(lower).toHaveAttribute("aria-selected", "true");
  });

  it("filters read-only cells before clear and paste", () => {
    const onClear = vi.fn();
    const onPaste = vi.fn();
    render(
      <TableKit
        tableId="filtered"
        columns={columns}
        rows={[["A", 1]]}
        isCellReadOnly={(position) => position.column === 1}
        onClear={onClear}
        onPaste={onPaste}
      />,
    );
    const cell = document.querySelector('[data-table-cell="filtered:0:0"]')!;
    fireEvent.click(cell);
    fireEvent.keyDown(cell, { key: "Delete" });
    expect(onClear).toHaveBeenCalledWith([{ row: 0, column: 0 }]);

    fireEvent.paste(screen.getByRole("table"), {
      clipboardData: { getData: () => "changed\tinvalid" },
    });
    expect(onPaste).toHaveBeenCalledWith(
      { row: 0, column: 0 },
      [["changed", undefined]],
    );
  });
});
