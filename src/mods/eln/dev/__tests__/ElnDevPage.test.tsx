import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CapabilityMatrix, TABLE_KIT_CAPABILITIES } from "../ElnDevPage";

describe("ELN Table Kit capability matrix", () => {
  it("covers every capability required by the frozen contract", () => {
    expect(TABLE_KIT_CAPABILITIES.map((capability) => capability.id)).toEqual([
      "text",
      "number",
      "date",
      "boolean",
      "dropdown",
      "entity-picker",
      "full-cell-editing",
      "keyboard",
      "selection",
      "clipboard",
      "event-isolation",
      "tracks",
      "stretch",
      "surface",
      "schema-picker",
      "registration",
      "entity-column",
    ]);
  });

  it("renders the matrix from the capability registry", () => {
    render(<CapabilityMatrix />);

    expect(screen.getByRole("heading", { name: "Table Kit capability matrix" })).toBeInTheDocument();
    expect(screen.getByText("Entity-picker cells")).toBeInTheDocument();
    expect(screen.getByText("Multi-cell selection (active cell and range)")).toBeInTheDocument();
    expect(screen.getByText("TSV copy/paste")).toBeInTheDocument();
    expect(screen.getByText("Registration and status indicators")).toBeInTheDocument();
    expect(screen.getAllByText("Domain").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("row")).toHaveLength(TABLE_KIT_CAPABILITIES.length + 1);
  });
});
