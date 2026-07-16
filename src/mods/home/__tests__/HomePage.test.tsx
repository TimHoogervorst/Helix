/**
 * Tests for HomePage — the blank placeholder page for the Home hub.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import HomePage from "../HomePage";

function renderHomePage() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}

describe("HomePage", () => {
  it("renders the Home heading", () => {
    renderHomePage();
    expect(screen.getByText("Home")).toBeInTheDocument();
  });

  it("renders placeholder text", () => {
    renderHomePage();
    expect(
      screen.getByText(/Welcome to Helix/i),
    ).toBeInTheDocument();
  });
});
