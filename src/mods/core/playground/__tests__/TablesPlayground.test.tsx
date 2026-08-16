import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TablesPlayground, { CELL_REGISTRY, getCellBehavior } from "../TablesPlayground";

describe("TablesPlayground", () => {
  it("renders the harness table and all playground sections", () => {
    render(<TablesPlayground />);

    expect(screen.getByTestId("tables-playground")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cell gallery" })).toBeInTheDocument();
    for (const title of [
      "Formula demo",
      "Layout demo",
      "Interaction bench",
      "Prototype tables",
      "Capability matrix",
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    expect(screen.getByTestId("cell-row-1-name")).toHaveTextContent("Aster");
  });

  it("commits a text cell on blur", () => {
    render(<TablesPlayground />);

    fireEvent.click(screen.getByTestId("cell-row-1-name"));
    const input = screen.getByTestId("cell-row-1-name-input");
    fireEvent.change(input, { target: { value: "Nova" } });
    fireEvent.blur(input);

    expect(screen.getByTestId("cell-row-1-name")).toHaveTextContent("Nova");
  });

  it("commits a text cell on Enter", () => {
    render(<TablesPlayground />);

    fireEvent.click(screen.getByTestId("cell-row-2-note"));
    const input = screen.getByTestId("cell-row-2-note-input");
    fireEvent.change(input, { target: { value: "Committed" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByTestId("cell-row-2-note")).toHaveTextContent("Committed");
  });

  it("starts editing when the padded cell area is clicked", () => {
    render(<TablesPlayground />);

    const cell = document.querySelector('[data-table-cell="0:0"]');
    expect(cell).toBeInTheDocument();
    fireEvent.click(cell!);

    expect(screen.getByTestId("cell-row-1-name-input")).toBeInTheDocument();
  });

  it("uses the interaction controller in the Cell Gallery", () => {
    render(<TablesPlayground />);

    const galleryCell = document.querySelector('[data-table-cell="gallery:0:0"]') as HTMLElement;
    fireEvent.click(galleryCell);
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

  it("commits with Enter and moves down", () => {
    render(<TablesPlayground />);

    fireEvent.click(screen.getByTestId("cell-row-1-name"));
    const input = screen.getByTestId("cell-row-1-name-input");
    fireEvent.change(input, { target: { value: "Nova" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByTestId("cell-row-1-name")).toHaveTextContent("Nova");
    expect(document.activeElement).toBe(document.querySelector('[data-table-cell="1:0"]'));
  });

  it("cancels with Escape and keeps navigation on the edited cell", () => {
    render(<TablesPlayground />);

    fireEvent.click(screen.getByTestId("cell-row-1-name"));
    fireEvent.keyDown(screen.getByTestId("cell-row-1-name-input"), { key: "Escape" });
    expect(document.activeElement).toBe(document.querySelector('[data-table-cell="0:0"]'));

    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(document.querySelector('[data-table-cell="1:0"]'));
  });

  it("starts editing the focused cell when Enter is pressed", () => {
    render(<TablesPlayground />);

    fireEvent.click(screen.getByTestId("cell-row-1-name"));
    fireEvent.keyDown(screen.getByTestId("cell-row-1-name-input"), { key: "Escape" });
    fireEvent.keyDown(document.activeElement!, { key: "Enter" });

    expect(screen.getByTestId("cell-row-1-name-input")).toBeInTheDocument();
  });

  it("enters the hovered cell when Enter is pressed", () => {
    render(<TablesPlayground />);

    fireEvent.click(screen.getByTestId("cell-row-1-name"));
    fireEvent.keyDown(screen.getByTestId("cell-row-1-name-input"), { key: "Escape" });

    const hovered = document.querySelector('[data-table-cell="1:1"]') as HTMLElement;
    fireEvent.mouseEnter(hovered);
    fireEvent.keyDown(document.activeElement!, { key: "Enter" });

    expect(screen.getByTestId("cell-row-2-role-input")).toBeInTheDocument();
  });

  it("lets keyboard navigation take the cursor back from the mouse", () => {
    render(<TablesPlayground />);

    fireEvent.click(screen.getByTestId("cell-row-1-name"));
    fireEvent.keyDown(screen.getByTestId("cell-row-1-name-input"), { key: "Escape" });

    fireEvent.mouseEnter(document.querySelector('[data-table-cell="2:2"]') as HTMLElement);
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    fireEvent.keyDown(document.activeElement!, { key: "Enter" });

    expect(screen.getByTestId("cell-row-2-name-input")).toBeInTheDocument();
  });

  it("does not navigate while editing a text value", () => {
    render(<TablesPlayground />);

    fireEvent.click(screen.getByTestId("cell-row-1-name"));
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

  it("recomputes typed formula columns after an input edit", () => {
    render(<TablesPlayground />);

    expect(screen.getByTestId("formula-cell-formula-row-1-ratio")).toHaveTextContent("4.00");
    expect(screen.getByTestId("formula-cell-formula-row-1-summary")).toHaveTextContent("SAMPLE ratio 4");

    fireEvent.change(screen.getByTestId("formula-input-formula-row-1-amount"), { target: { value: "24" } });

    expect(screen.getByTestId("formula-cell-formula-row-1-ratio")).toHaveTextContent("8.00");
    expect(screen.getByTestId("formula-cell-formula-row-1-summary")).toHaveTextContent("SAMPLE ratio 8");
  });

  it("renders formula cells read-only and shows typed error badges", () => {
    render(<TablesPlayground />);

    const ratio = screen.getByTestId("formula-cell-formula-row-1-ratio");
    expect(ratio.querySelector('[data-formula-cell="true"]')).toBeInTheDocument();
    expect(ratio.querySelector("input")).not.toBeInTheDocument();
    expect(screen.getByTestId("formula-cell-formula-row-1-broken")).toHaveTextContent("#REF!");
    expect(screen.getAllByLabelText("Formula error #REF!")).toHaveLength(2);
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
    fireEvent.click(display);
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

    fireEvent.click(committed);
    const cancelInput = screen.getByTestId(`gallery-${shape}-display-input`);
    fireEvent.change(cancelInput, { target: { value: "Cancelled" } });
    fireEvent.keyDown(cancelInput, { key: "Escape" });
    expect(screen.getByTestId(`gallery-${shape}-display`)).toHaveTextContent(expectedValue);
  });
});
