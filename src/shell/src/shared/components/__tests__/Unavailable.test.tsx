import { fireEvent, render, screen } from "@testing-library/react";
import { JsonDisplayField } from "../JsonDisplayField";
import { Unavailable } from "../Unavailable";

describe("shared unavailable primitives", () => {
  it("identifies the unavailable contribution without throwing", () => {
    render(<Unavailable kind="Block" name="eln.table" />);
    expect(screen.getByTestId("unavailable")).toHaveAttribute("data-unavailable-kind", "Block");
    expect(screen.getByText(/not installed/)).toBeInTheDocument();
  });

  it("collapses JSON to a preview and expands to pretty JSON", () => {
    render(<JsonDisplayField label="Raw content" value={{ alpha: 1, nested: { beta: true } }} />);
    const toggle = screen.getByRole("button");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveTextContent('{"alpha":1,"nested":{"beta":true}}');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveTextContent('"alpha": 1');
  });
});
