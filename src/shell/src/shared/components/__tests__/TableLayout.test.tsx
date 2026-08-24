import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  StickyActionCell,
  StickyActionHeader,
  TableScroll,
} from "../../table/TableLayout";
import { TableChrome } from "../../table/TableChrome";

describe("Table layout primitives", () => {
  it("composes constrained scrolling, sticky action, and chrome contracts", () => {
    render(
      <TableChrome title="Results" toolbar={<span>Toolbar</span>} addRow={<button>Add</button>}>
        <TableScroll data-testid="scroll">
          <table>
            <thead><tr><StickyActionHeader aria-label="Actions" /></tr></thead>
            <tbody><tr><StickyActionCell>Action</StickyActionCell></tr></tbody>
          </table>
        </TableScroll>
      </TableChrome>,
    );

    expect(screen.getByTestId("scroll")).toHaveClass("table-layout-scroll");
    expect(screen.getByTestId("scroll")).toHaveAttribute("data-bleed-role", "viewport");
    expect(screen.getByRole("heading", { name: "Results" }).parentElement).toHaveAttribute(
      "data-bleed-role",
      "bar",
    );
    expect(screen.getByTestId("scroll").className).not.toContain("table-layout-scroll--");
    expect(screen.getByRole("heading", { name: "Results" })).toBeInTheDocument();
    expect(screen.getByText("Toolbar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Action" }).className).toContain("table-layout-action");
  });
});
