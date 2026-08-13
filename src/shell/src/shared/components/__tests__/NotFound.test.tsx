import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import NotFound from "../NotFound";

describe("NotFound", () => {
  it("renders the shared ambiguous message", () => {
    render(<NotFound />);

    expect(screen.getByTestId("not-found")).toBeInTheDocument();
    expect(
      screen.getByText("Item not found — or you may not have access"),
    ).toBeInTheDocument();
  });
});
