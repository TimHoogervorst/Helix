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

  it("copies typed values and leaves gaps for non-contiguous selections", () => {
    renderKit("copy", [["A", 1], ["B", 2]]);
    const first = document.querySelector('[data-table-cell="copy:0:0"]')!;
    const last = document.querySelector('[data-table-cell="copy:1:1"]')!;
    const setData = vi.fn();

    fireEvent.click(first);
    fireEvent.click(last, { ctrlKey: true });
    fireEvent.copy(screen.getByRole("table"), { clipboardData: { setData } });

    expect(setData).toHaveBeenCalledWith("text/plain", "A\t\n\t2");
  });

  it("clamps pasted values and selects the pasted range", () => {
    const onPaste = vi.fn();
    render(
      <TableKit
        tableId="clamped"
        columns={columns}
        rows={[["A", 1]]}
        onPaste={onPaste}
      />,
    );
    const cell = document.querySelector('[data-table-cell="clamped:0:0"]')!;

    fireEvent.click(cell);
    fireEvent.paste(screen.getByRole("table"), {
      clipboardData: { getData: () => "changed\t2\t3\nignored\t4" },
    });

    expect(onPaste).toHaveBeenCalledWith({ row: 0, column: 0 }, [["changed", 2]]);
    expect(cell).toHaveAttribute("aria-selected", "true");
    expect(document.querySelector('[data-table-cell="clamped:0:1"]'))
      .toHaveAttribute("aria-selected", "true");
  });

  it("renders an empty-cell placeholder", () => {
    render(
      <TableKit
        columns={[{ header: "Computed", shape: "number", placeholder: "Refresh to calculate" }]}
        rows={[[null]]}
      />,
    );

    expect(screen.getByText("Refresh to calculate")).toBeInTheDocument();
  });

  it("skips values that fail the writable destination shape", () => {
    const onPaste = vi.fn();
    render(
      <TableKit
        tableId="invalid"
        columns={columns}
        rows={[["A", 1]]}
        onPaste={onPaste}
      />,
    );
    const cell = document.querySelector('[data-table-cell="invalid:0:1"]')!;

    fireEvent.click(cell);
    fireEvent.paste(screen.getByRole("table"), {
      clipboardData: { getData: () => "not-a-number" },
    });

    expect(onPaste).toHaveBeenCalledWith({ row: 0, column: 1 }, [[undefined]]);
  });

  it("does not mutate or enter editing when the module is read-only", () => {
    const onClear = vi.fn();
    const onPaste = vi.fn();
    const onEdit = vi.fn();
    render(
      <TableKit
        columns={columns}
        rows={[["A", 1]]}
        readOnly
        onClear={onClear}
        onPaste={onPaste}
        onEdit={onEdit}
      />,
    );
    const cell = document.querySelector('[data-table-cell="table-kit:0:0"]')!;

    fireEvent.doubleClick(cell);
    fireEvent.keyDown(cell, { key: "Delete" });
    fireEvent.paste(screen.getByRole("table"), {
      clipboardData: { getData: () => "changed" },
    });

    expect(onClear).not.toHaveBeenCalled();
    expect(onPaste).not.toHaveBeenCalled();
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("does not re-enter editing when Backspace targets a read-only cell", () => {
    const onClear = vi.fn();
    render(
      <TableKit
        tableId="backspace"
        columns={columns}
        rows={[["A", 1]]}
        isCellReadOnly={(position) => position.column === 0}
        onClear={onClear}
      />,
    );
    const cell = document.querySelector('[data-table-cell="backspace:0:0"]')!;

    fireEvent.click(cell);
    fireEvent.keyDown(cell, { key: "Backspace" });

    expect(onClear).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("clears and enters editing when Backspace targets an editable cell", () => {
    const onClear = vi.fn();
    render(
      <TableKit
        tableId="editable-backspace"
        columns={columns}
        rows={[["A", 1]]}
        onClear={onClear}
      />,
    );
    const cell = document.querySelector('[data-table-cell="editable-backspace:0:0"]')!;

    fireEvent.click(cell);
    fireEvent.keyDown(cell, { key: "Backspace" });

    expect(onClear).toHaveBeenCalledWith([{ row: 0, column: 0 }]);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });
});
