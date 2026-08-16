import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
