import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TableBlockContent, type TableColumn, type TableRow } from "../TableNodeView";

const columns: TableColumn[] = [
  { id: "name", name: "Name" },
  { id: "amount", name: "Amount" },
];

const rows: TableRow[] = [
  { id: "row-1", cells: { name: "Sample", amount: 10 } },
  { id: "row-2", cells: { name: "Second", amount: 20 } },
];

function renderTable(updateAttrs = vi.fn()) {
  return {
    updateAttrs,
    ...render(
      <TableBlockContent
        title="Samples"
        columns={columns}
        rows={rows}
        updateAttrs={updateAttrs}
      />,
    ),
  };
}

describe("TableBlockContent", () => {
  it("renders text-only columns without type controls", () => {
    renderTable();

    expect(screen.queryByTestId("column-type-name")).not.toBeInTheDocument();
    expect(screen.queryByTestId("column-type-amount")).not.toBeInTheDocument();
  });

  it("uses the constrained scroll layout without breakout classes", () => {
    renderTable();

    const scroll = screen.getByTestId("eln-table-grid").parentElement?.parentElement;
    expect(scroll).toHaveClass("table-layout-scroll");
    expect(scroll?.className).not.toContain("table-layout-scroll--");
  });

  it("renders legacy typed columns as text", () => {
    const typedColumns: TableColumn[] = [
      { id: "role", name: "Role", type: "dropdown" },
      { id: "entity", name: "Entity", type: "entity-picker" },
    ];
    render(
      <TableBlockContent
        title="Samples"
        columns={typedColumns}
        rows={[{ id: "row-1", cells: { role: "Researcher", entity: "ENT-001" } }]}
        updateAttrs={vi.fn()}
      />,
    );

    fireEvent.doubleClick(screen.getByTestId("cell-row-1-role"));
    expect(screen.getByTestId("cell-row-1-role-input")).toHaveAttribute("type", "text");
    fireEvent.doubleClick(screen.getByTestId("cell-row-1-entity"));
    expect(screen.getByTestId("cell-row-1-entity-input")).toHaveAttribute("type", "text");
  });

  it("commits values through the selected cell behavior", () => {
    const { updateAttrs } = renderTable();

    fireEvent.doubleClick(screen.getByTestId("cell-row-1-amount"));
    const input = screen.getByTestId("cell-row-1-amount-input");
    expect(input).toHaveAttribute("type", "text");
    fireEvent.change(input, { target: { value: "12.5" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(updateAttrs).toHaveBeenCalledWith({
      rows: [
        { id: "row-1", cells: { name: "Sample", amount: "12.5" } },
        rows[1],
      ],
    });
  });

  it("navigates cells and copies a selected range as TSV", () => {
    renderTable();
    const firstCell = document.querySelector('[data-table-cell="eln-table:0:0"]') as HTMLElement;
    firstCell.focus();
    fireEvent.keyDown(firstCell, { key: "ArrowRight", shiftKey: true });

    expect(document.activeElement).toBe(
      document.querySelector('[data-table-cell="eln-table:0:1"]'),
    );

    const setData = vi.fn();
    fireEvent.copy(screen.getByTestId("eln-table-grid"), {
      clipboardData: { setData },
    });
    expect(setData).toHaveBeenCalledWith("text/plain", "Sample\t10");
  });

  it("pastes TSV values as typed values from the active cell", () => {
    const { updateAttrs } = renderTable();
    const firstCell = document.querySelector('[data-table-cell="eln-table:0:0"]') as HTMLElement;
    firstCell.focus();

    fireEvent.paste(screen.getByTestId("eln-table-grid"), {
      clipboardData: { getData: () => "Changed\t15.25" },
    });

    expect(updateAttrs).toHaveBeenCalledWith({
      rows: [
        { id: "row-1", cells: { name: "Changed", amount: "15.25" } },
        rows[1],
      ],
    });
  });
});
