import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TablesPlayground, { CELL_REGISTRY, getCellBehavior } from "../TablesPlayground";

describe("TablesPlayground", () => {
  it("renders the harness table and all playground sections", () => {
    render(<TablesPlayground />);

    expect(screen.getByTestId("tables-playground")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cell gallery" })).toBeInTheDocument();
    for (const title of [
      "Layout demo",
      "Interaction bench",
      "Prototype tables",
      "Capability matrix",
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    expect(screen.getByTestId("cell-row-1-name")).toHaveTextContent("Aster");
  });

  it("demonstrates the reusable layout pieces", () => {
    render(<TablesPlayground />);

    expect(screen.getByTestId("layout-scroll-container")).toBeInTheDocument();
    expect(screen.getByTestId("layout-action-header")).toHaveAttribute("aria-label", "Actions");
    expect(screen.getByTestId("layout-table-chrome")).toBeInTheDocument();
    expect(screen.getByTestId("layout-toolbar-slot")).toHaveTextContent("Toolbar slot");
    expect(screen.getByTestId("layout-add-row")).toHaveTextContent("Add row");
    expect(screen.getByTestId("layout-stretch-wrapper").className).toContain("auto");

    fireEvent.click(screen.getByTestId("layout-stretch-toggle"));

    expect(screen.getByTestId("layout-stretch-wrapper").className).toContain("full");
    expect(screen.getByTestId("layout-stretch-toggle")).toHaveAttribute("aria-pressed", "true");
  });

  it("commits a text cell on blur", () => {
    render(<TablesPlayground />);

    fireEvent.doubleClick(screen.getByTestId("cell-row-1-name"));
    const input = screen.getByTestId("cell-row-1-name-input");
    fireEvent.change(input, { target: { value: "Nova" } });
    fireEvent.blur(input);

    expect(screen.getByTestId("cell-row-1-name")).toHaveTextContent("Nova");
  });

  it("commits a text cell on Enter", () => {
    render(<TablesPlayground />);

    fireEvent.doubleClick(screen.getByTestId("cell-row-2-note"));
    const input = screen.getByTestId("cell-row-2-note-input");
    fireEvent.change(input, { target: { value: "Committed" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByTestId("cell-row-2-note")).toHaveTextContent("Committed");
  });

  it("clears a selected cell with Delete", () => {
    render(<TablesPlayground />);

    const cell = document.querySelector('[data-table-cell="0:0"]') as HTMLElement;
    fireEvent.click(cell);
    fireEvent.keyDown(cell, { key: "Delete" });

    expect(screen.getByTestId("cell-row-1-name")).not.toHaveTextContent("Aster");
  });

  it("clears with Backspace and opens an empty draft on the active cell", () => {
    render(<TablesPlayground />);

    const cell = document.querySelector('[data-table-cell="0:0"]') as HTMLElement;
    fireEvent.click(cell);
    fireEvent.keyDown(cell, { key: "Backspace" });

    expect(screen.getByTestId("cell-row-1-name-input")).toHaveValue("");
    fireEvent.keyDown(screen.getByTestId("cell-row-1-name-input"), { key: "Escape" });
    expect(screen.getByTestId("cell-row-1-name")).not.toHaveTextContent("Aster");
  });

  it("clears only the active cell with Backspace in a multi-selection", () => {
    render(<TablesPlayground />);

    const firstCell = document.querySelector('[data-table-cell="0:0"]') as HTMLElement;
    const activeCell = document.querySelector('[data-table-cell="0:1"]') as HTMLElement;
    fireEvent.click(firstCell);
    fireEvent.click(activeCell, { ctrlKey: true });
    fireEvent.keyDown(activeCell, { key: "Backspace" });

    expect(screen.getByTestId("cell-row-1-name")).toHaveTextContent("Aster");
    expect(screen.getByTestId("cell-row-1-role-input")).toHaveValue("");
  });

  it("selects on click and starts editing on double-click", () => {
    render(<TablesPlayground />);

    const cell = document.querySelector('[data-table-cell="0:0"]');
    expect(cell).toBeInTheDocument();
    fireEvent.click(cell!);

    expect(cell).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByTestId("cell-row-1-name-input")).not.toBeInTheDocument();

    fireEvent.doubleClick(cell!);

    expect(screen.getByTestId("cell-row-1-name-input")).toBeInTheDocument();
  });

  it("uses the interaction controller in the Cell Gallery", () => {
    render(<TablesPlayground />);

    const galleryCell = document.querySelector('[data-table-cell="gallery:0:0"]') as HTMLElement;
    fireEvent.doubleClick(galleryCell);
    expect(screen.getByTestId("gallery-text-display-input")).toBeInTheDocument();

    fireEvent.keyDown(screen.getByTestId("gallery-text-display-input"), { key: "Escape" });
    fireEvent.keyDown(galleryCell, { key: "ArrowDown" });
    expect(document.activeElement).toBe(document.querySelector('[data-table-cell="gallery:1:0"]'));
  });

  it("navigates with arrows, Tab, and Shift-Tab when not editing", () => {
    render(<TablesPlayground />);

    const firstCell = document.querySelector('[data-table-cell="0:0"]') as HTMLElement;
    firstCell.focus();
    fireEvent.keyDown(firstCell, { key: "ArrowRight" });
    expect(document.activeElement).toBe(document.querySelector('[data-table-cell="0:1"]'));

    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(document.activeElement).toBe(document.querySelector('[data-table-cell="0:2"]'));

    fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(document.querySelector('[data-table-cell="0:1"]'));
  });

  it("uses Shift-click to replace the selection from the original anchor", () => {
    render(<TablesPlayground />);

    const anchor = document.querySelector('[data-table-cell="0:0"]') as HTMLElement;
    const target = document.querySelector('[data-table-cell="1:2"]') as HTMLElement;
    fireEvent.click(anchor);
    fireEvent.click(document.querySelector('[data-table-cell="0:1"]')!, { ctrlKey: true });
    fireEvent.click(target, { shiftKey: true });

    for (const position of ["0:0", "0:1", "0:2", "1:0", "1:1", "1:2"]) {
      expect(document.querySelector(`[data-table-cell="${position}"]`)).toHaveAttribute("aria-selected", "true");
    }
    expect(target).toHaveAttribute("data-table-active", "true");
  });

  it("uses Ctrl-click to build a non-contiguous selection without moving the anchor", () => {
    render(<TablesPlayground />);

    const anchor = document.querySelector('[data-table-cell="0:0"]') as HTMLElement;
    const second = document.querySelector('[data-table-cell="1:1"]') as HTMLElement;
    const third = document.querySelector('[data-table-cell="2:2"]') as HTMLElement;
    fireEvent.click(anchor);
    fireEvent.click(second, { ctrlKey: true });
    fireEvent.click(third, { ctrlKey: true });
    fireEvent.click(second, { ctrlKey: true });

    expect(anchor).toHaveAttribute("aria-selected", "true");
    expect(second).toHaveAttribute("aria-selected", "false");
    expect(third).toHaveAttribute("aria-selected", "true");
    expect(second).toHaveAttribute("data-table-active", "true");

    fireEvent.click(document.querySelector('[data-table-cell="2:0"]')!, { shiftKey: true });
    for (const position of ["0:0", "1:0", "2:0"]) {
      expect(document.querySelector(`[data-table-cell="${position}"]`)).toHaveAttribute("aria-selected", "true");
    }

    fireEvent.click(second);
    expect(second).toHaveAttribute("aria-selected", "true");
  });

  it("uses Ctrl-Arrow to accumulate cells and Ctrl+A to select the table", () => {
    render(<TablesPlayground />);

    const firstCell = document.querySelector('[data-table-cell="0:0"]') as HTMLElement;
    fireEvent.click(firstCell);
    firstCell.focus();
    fireEvent.keyDown(firstCell, { key: "ArrowLeft", ctrlKey: true });
    expect(firstCell).toHaveAttribute("data-table-active", "true");
    fireEvent.keyDown(firstCell, { key: "ArrowRight", ctrlKey: true });
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown", ctrlKey: true });

    expect(document.querySelector('[data-table-cell="0:0"]')).toHaveAttribute("aria-selected", "true");
    expect(document.querySelector('[data-table-cell="0:1"]')).toHaveAttribute("aria-selected", "true");
    expect(document.querySelector('[data-table-cell="1:1"]')).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(document.activeElement!, { key: "a", ctrlKey: true });

    for (const position of ["0:0", "0:1", "0:2", "1:0", "1:1", "1:2", "2:0", "2:1", "2:2"]) {
      expect(document.querySelector(`[data-table-cell="${position}"]`)).toHaveAttribute("aria-selected", "true");
    }
  });

  it("commits with Enter and moves down", () => {
    render(<TablesPlayground />);

    fireEvent.doubleClick(screen.getByTestId("cell-row-1-name"));
    const input = screen.getByTestId("cell-row-1-name-input");
    fireEvent.change(input, { target: { value: "Nova" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByTestId("cell-row-1-name")).toHaveTextContent("Nova");
    expect(document.activeElement).toBe(document.querySelector('[data-table-cell="1:0"]'));
  });

  it("cancels with Escape and keeps navigation on the edited cell", () => {
    render(<TablesPlayground />);

    fireEvent.doubleClick(screen.getByTestId("cell-row-1-name"));
    fireEvent.keyDown(screen.getByTestId("cell-row-1-name-input"), { key: "Escape" });
    expect(document.activeElement).toBe(document.querySelector('[data-table-cell="0:0"]'));

    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(document.querySelector('[data-table-cell="1:0"]'));
  });

  it("starts editing the focused cell when Enter is pressed", () => {
    render(<TablesPlayground />);

    fireEvent.doubleClick(screen.getByTestId("cell-row-1-name"));
    fireEvent.keyDown(screen.getByTestId("cell-row-1-name-input"), { key: "Escape" });
    fireEvent.keyDown(document.activeElement!, { key: "Enter" });

    expect(screen.getByTestId("cell-row-1-name-input")).toBeInTheDocument();
  });

  it("selects a marquee range and finalizes when the mouse is released outside", () => {
    render(<TablesPlayground />);

    const start = document.querySelector('[data-table-cell="0:0"]') as HTMLElement;
    const end = document.querySelector('[data-table-cell="2:2"]') as HTMLElement;
    fireEvent.mouseDown(start);
    fireEvent.mouseEnter(end);
    fireEvent.mouseUp(document);

    for (const position of ["0:0", "0:1", "0:2", "1:0", "1:1", "1:2", "2:0", "2:1", "2:2"]) {
      expect(document.querySelector(`[data-table-cell="${position}"]`)).toHaveAttribute("aria-selected", "true");
    }
  });

  it("selects a range from a boolean cell without toggling its checkbox", () => {
    render(<TablesPlayground />);

    const booleanCell = document.querySelector('[data-table-cell="gallery:3:0"]') as HTMLElement;
    const target = document.querySelector('[data-table-cell="gallery:4:1"]') as HTMLElement;
    const checkbox = screen.getByTestId("gallery-boolean-display").querySelector("input") as HTMLInputElement;
    const initialValue = checkbox.checked;

    fireEvent.mouseDown(checkbox);
    fireEvent.mouseEnter(target);
    fireEvent.mouseUp(document);

    expect(checkbox.checked).toBe(initialValue);
    expect(booleanCell).toHaveAttribute("aria-selected", "true");
    expect(target).toHaveAttribute("aria-selected", "true");
  });

  it("starts editing the focused cell with F2", () => {
    render(<TablesPlayground />);

    const cell = document.querySelector('[data-table-cell="0:0"]') as HTMLElement;
    cell.focus();
    fireEvent.keyDown(cell, { key: "F2" });

    expect(screen.getByTestId("cell-row-1-name-input")).toBeInTheDocument();
  });

  it("selects a boolean cell while a click still toggles it", () => {
    render(<TablesPlayground />);

    const cell = document.querySelector('[data-table-cell="gallery:3:0"]') as HTMLElement;
    const checkbox = screen.getByTestId("gallery-boolean-display").querySelector("input") as HTMLInputElement;
    expect(cell).toHaveAttribute("aria-selected", "false");

    fireEvent.click(checkbox);

    expect(cell).toHaveAttribute("aria-selected", "true");
    expect(checkbox).not.toBeChecked();
    expect(screen.queryByTestId("gallery-boolean-display-input")).not.toBeInTheDocument();
  });

  it("enters the active cell when Enter is pressed", () => {
    render(<TablesPlayground />);

    fireEvent.doubleClick(screen.getByTestId("cell-row-1-name"));
    fireEvent.keyDown(screen.getByTestId("cell-row-1-name-input"), { key: "Escape" });

    const hovered = document.querySelector('[data-table-cell="1:1"]') as HTMLElement;
    fireEvent.mouseEnter(hovered);
    fireEvent.keyDown(document.activeElement!, { key: "Enter" });

    expect(screen.getByTestId("cell-row-1-name-input")).toBeInTheDocument();
  });

  it("lets keyboard navigation take the cursor back from the mouse", () => {
    render(<TablesPlayground />);

    fireEvent.doubleClick(screen.getByTestId("cell-row-1-name"));
    fireEvent.keyDown(screen.getByTestId("cell-row-1-name-input"), { key: "Escape" });

    fireEvent.mouseEnter(document.querySelector('[data-table-cell="2:2"]') as HTMLElement);
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    fireEvent.keyDown(document.activeElement!, { key: "Enter" });

    expect(screen.getByTestId("cell-row-2-name-input")).toBeInTheDocument();
  });

  it("does not navigate while editing a text value", () => {
    render(<TablesPlayground />);

    fireEvent.doubleClick(screen.getByTestId("cell-row-1-name"));
    const input = screen.getByTestId("cell-row-1-name-input");
    fireEvent.keyDown(input, { key: "ArrowRight" });

    expect(document.activeElement).toBe(input);
    expect(screen.getByTestId("cell-row-1-name-input")).toBeInTheDocument();
  });

  it("copies a selected range as TSV", () => {
    render(<TablesPlayground />);

    const container = screen.getByTestId("harness-table");
    const firstCell = document.querySelector('[data-table-cell="0:0"]') as HTMLElement;
    firstCell.focus();
    fireEvent.keyDown(firstCell, { key: "ArrowRight", shiftKey: true });
    const setData = vi.fn();
    fireEvent.copy(container, { clipboardData: { setData } });

    expect(setData).toHaveBeenCalledWith("text/plain", "Aster\tResearcher");
  });

  it("copies a non-contiguous selection as its bounding TSV range", () => {
    render(<TablesPlayground />);

    fireEvent.click(document.querySelector('[data-table-cell="0:0"]')!);
    fireEvent.click(document.querySelector('[data-table-cell="2:2"]')!, { ctrlKey: true });
    const setData = vi.fn();
    fireEvent.copy(screen.getByTestId("harness-table"), { clipboardData: { setData } });

    expect(setData).toHaveBeenCalledWith(
      "text/plain",
      "Aster\t\t\n\t\t\n\t\tLocal mock data",
    );
  });

  it("pastes TSV values from the active anchor cell", () => {
    render(<TablesPlayground />);

    const firstCell = document.querySelector('[data-table-cell="0:0"]') as HTMLElement;
    firstCell.focus();
    fireEvent.paste(screen.getByTestId("harness-table"), {
      clipboardData: { getData: () => "Nova\tScientist\nElm\tReviewer" },
    });

    expect(screen.getByTestId("cell-row-1-name")).toHaveTextContent("Nova");
    expect(screen.getByTestId("cell-row-1-role")).toHaveTextContent("Scientist");
    expect(screen.getByTestId("cell-row-2-name")).toHaveTextContent("Elm");
  });

  it("clamps paste to the table and selects the pasted region", () => {
    render(<TablesPlayground />);

    const anchor = document.querySelector('[data-table-cell="1:1"]') as HTMLElement;
    fireEvent.click(anchor);
    fireEvent.paste(screen.getByTestId("harness-table"), {
      clipboardData: { getData: () => "One\tTwo\tThree\nFour\tFive\tSix\nSeven\tEight\tNine" },
    });

    expect(screen.getByTestId("cell-row-2-role")).toHaveTextContent("One");
    expect(screen.getByTestId("cell-row-2-note")).toHaveTextContent("Two");
    expect(screen.getByTestId("cell-row-3-role")).toHaveTextContent("Four");
    expect(screen.getByTestId("cell-row-3-note")).toHaveTextContent("Five");
    for (const position of ["1:1", "1:2", "2:1", "2:2"]) {
      expect(document.querySelector(`[data-table-cell="${position}"]`)).toHaveAttribute("aria-selected", "true");
    }
    expect(document.querySelector('[data-table-cell="0:0"]')).toHaveAttribute("aria-selected", "false");
  });

  it("registers every supported operand shape and falls back to text", () => {
    expect(Object.keys(CELL_REGISTRY)).toEqual([
      "text",
      "number",
      "date",
      "boolean",
      "dropdown",
      "entity-picker",
    ]);
    expect(getCellBehavior("future-shape")).toBe(CELL_REGISTRY.text);
  });

  it("switches schema prototypes and mock-registers a row", () => {
    render(<TablesPlayground />);

    expect(screen.getByTestId("schema-cell-schema-row-1-name")).toHaveTextContent("Aster");
    fireEvent.click(screen.getByTestId("register-schema-row-1"));
    expect(screen.getByText("Registered")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("schema-mode-entity"));
    expect(screen.getByText("Source entity")).toBeInTheDocument();
    expect(screen.getByTestId("schema-cell-schema-row-1-entity")).toHaveTextContent("SMP-001");
    fireEvent.doubleClick(screen.getByTestId("schema-cell-schema-row-1-entity"));
    expect(screen.getByTestId("schema-cell-schema-row-1-entity-input")).toHaveDisplayValue("SMP-001");
    expect(screen.getByRole("option", { name: "CTRL-001" })).toBeInTheDocument();
  });

  it("lets the free-form prototype change a column type and edit the cell", () => {
    render(<TablesPlayground />);

    const quantityType = screen.getByRole("combobox", { name: "Type for Quantity" });
    fireEvent.change(quantityType, { target: { value: "text" } });
    fireEvent.doubleClick(screen.getByTestId("free-cell-free-row-1-quantity"));
    const input = screen.getByTestId("free-cell-free-row-1-quantity-input");
    fireEvent.change(input, { target: { value: "three" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByTestId("free-cell-free-row-1-quantity")).toHaveTextContent("three");
  });

  it.each([
    ["text", "string", "Changed"],
    ["number", "number", "7"],
    ["date", "string", "2027-01-01"],
    ["boolean", "boolean", "False"],
    ["dropdown", "string", "Operator"],
    ["entity-picker", "string", "Changed"],
    ["future-shape", "string", "Changed"],
  ])("commits and cancels %s with its typed value", (shape, expectedType, expectedValue) => {
    render(<TablesPlayground />);

    const display = screen.getByTestId(`gallery-${shape}-display`);
    fireEvent.doubleClick(display);
    const input = screen.getByTestId(`gallery-${shape}-display-input`);

    if (input instanceof HTMLInputElement && input.type === "checkbox") {
      fireEvent.change(input, { target: { checked: false } });
    } else if (input instanceof HTMLSelectElement) {
      fireEvent.change(input, { target: { value: "Operator" } });
    } else {
      fireEvent.change(input, {
        target: {
          value:
            shape === "number" ? "7" : shape === "date" ? "2027-01-01" : "Changed",
        },
      });
    }
    fireEvent.keyDown(input, { key: "Enter" });

    const committed = screen.getByTestId(`gallery-${shape}-display`);
    expect(committed).toHaveAttribute("data-value-type", expectedType);
    expect(committed).toHaveTextContent(expectedValue);

    fireEvent.doubleClick(committed);
    const cancelInput = screen.getByTestId(`gallery-${shape}-display-input`);
    fireEvent.change(cancelInput, { target: { value: "Cancelled" } });
    fireEvent.keyDown(cancelInput, { key: "Escape" });
    expect(screen.getByTestId(`gallery-${shape}-display`)).toHaveTextContent(expectedValue);
  });
});
