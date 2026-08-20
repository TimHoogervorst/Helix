import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  StickyActionCell,
  StickyActionHeader,
  TableScroll,
  TableStretch,
} from "../../table/TableLayout";
import { TableChrome } from "../../table/TableChrome";

describe("Table layout primitives", () => {
  it("composes stretch, scroll, sticky action, and chrome contracts", () => {
    render(
      <TableStretch mode="full" data-testid="stretch">
        <TableChrome title="Results" toolbar={<span>Toolbar</span>} addRow={<button>Add</button>}>
          <TableScroll mode="auto" data-testid="scroll">
            <table>
              <thead><tr><StickyActionHeader aria-label="Actions" /></tr></thead>
              <tbody><tr><StickyActionCell>Action</StickyActionCell></tr></tbody>
            </table>
          </TableScroll>
        </TableChrome>
      </TableStretch>,
    );

    expect(screen.getByTestId("stretch").className).toContain("table-layout-stretch--full");
    expect(screen.getByTestId("scroll").className).toContain("table-layout-scroll--auto");
    expect(screen.getByRole("heading", { name: "Results" })).toBeInTheDocument();
    expect(screen.getByText("Toolbar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Action" }).className).toContain("table-layout-action");
  });
});
