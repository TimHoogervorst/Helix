import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useTableInteraction } from "../../table/useTableInteraction";

function TestTable({ tableId, rowCount = 1, columnCount = 1 }: { tableId: string; rowCount?: number; columnCount?: number }) {
  const interaction = useTableInteraction({
    tableId,
    rowCount,
    columnCount,
    getValues: () => Array.from({ length: rowCount }, () => Array.from({ length: columnCount }, () => "value")),
    onClear: () => {},
    onPaste: () => {},
  });

  return (
    <div ref={interaction.containerRef} data-testid={tableId}>
      {Array.from({ length: rowCount }, (_, row) => Array.from({ length: columnCount }, (_, column) => (
        <button key={`${row}:${column}`} {...interaction.cellProps({ row, column })}>
          {tableId} cell {row}:{column}
        </button>
      )))}
    </div>
  );
}

describe("useTableInteraction", () => {
  it("does not select the first cell on initial render", () => {
    render(<TestTable tableId="first" />);

    expect(screen.getByRole("button", { name: "first cell 0:0" })).toHaveAttribute("aria-selected", "false");
  });

  it("clears the selected cell when clicking outside the table", () => {
    render(
      <>
        <TestTable tableId="first" />
        <div data-testid="outside">Outside text</div>
      </>,
    );

    const cell = screen.getByRole("button", { name: "first cell 0:0" });
    fireEvent.click(cell);
    expect(cell).toHaveAttribute("aria-selected", "true");

    fireEvent.pointerDown(screen.getByTestId("outside"));

    expect(cell).toHaveAttribute("aria-selected", "false");
  });

  it("clears the previous table selection when selecting another table", () => {
    render(
      <>
        <TestTable tableId="first" />
        <TestTable tableId="second" />
      </>,
    );

    const firstCell = screen.getByRole("button", { name: "first cell 0:0" });
    const secondCell = screen.getByRole("button", { name: "second cell 0:0" });
    fireEvent.click(firstCell);
    fireEvent.pointerDown(secondCell);
    fireEvent.click(secondCell);

    expect(firstCell).toHaveAttribute("aria-selected", "false");
    expect(secondCell).toHaveAttribute("aria-selected", "true");
  });

  it("prunes selected cells and clamps the active cell when dimensions shrink", () => {
    const { rerender } = render(<TestTable tableId="resizable" rowCount={2} columnCount={2} />);

    const target = screen.getByRole("button", { name: "resizable cell 1:1" });
    fireEvent.click(target);

    rerender(<TestTable tableId="resizable" rowCount={1} columnCount={1} />);

    const survivingCell = screen.getByRole("button", { name: "resizable cell 0:0" });
    expect(survivingCell).toHaveAttribute("aria-selected", "true");
    expect(survivingCell).toHaveAttribute("data-table-active", "true");
  });
});
