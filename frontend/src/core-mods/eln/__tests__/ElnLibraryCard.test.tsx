import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import ElnLibraryCard from "../library/ElnLibraryCard";

describe("ElnLibraryCard", () => {
  it("renders nothing (returns null)", () => {
    const { container } = render(
      <ElnLibraryCard item={{}} viewMode="list" isSelected={false} />,
    );
    expect(container.innerHTML).toBe("");
  });
});
