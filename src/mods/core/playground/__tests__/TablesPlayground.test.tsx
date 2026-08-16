import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TablesPlayground from "../TablesPlayground";

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
});
