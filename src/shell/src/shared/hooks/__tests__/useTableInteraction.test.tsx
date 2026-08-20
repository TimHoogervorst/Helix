import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useTableInteraction } from "../useTableInteraction";

function TestTable({ tableId }: { tableId: string }) {
  const interaction = useTableInteraction({
    tableId,
    rowCount: 1,
    columnCount: 1,
    getValues: () => [["value"]],
    onClear: () => {},
    onPaste: () => {},
  });

  return (
    <div ref={interaction.containerRef} data-testid={tableId}>
      <button {...interaction.cellProps({ row: 0, column: 0 })}>
        {tableId} cell
      </button>
    </div>
  );
}

describe("useTableInteraction", () => {
  it("does not select the first cell on initial render", () => {
    render(<TestTable tableId="first" />);

    expect(screen.getByRole("button", { name: "first cell" })).toHaveAttribute("aria-selected", "false");
  });

  it("clears the selected cell when clicking outside the table", () => {
    render(
      <>
        <TestTable tableId="first" />
        <div data-testid="outside">Outside text</div>
      </>,
    );

    const cell = screen.getByRole("button", { name: "first cell" });
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

    const firstCell = screen.getByRole("button", { name: "first cell" });
    const secondCell = screen.getByRole("button", { name: "second cell" });
    fireEvent.click(firstCell);
    fireEvent.pointerDown(secondCell);
    fireEvent.click(secondCell);

    expect(firstCell).toHaveAttribute("aria-selected", "false");
    expect(secondCell).toHaveAttribute("aria-selected", "true");
  });
});
