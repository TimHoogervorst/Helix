import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import LimsWorkspacePage from "./LimsWorkspacePage";

const mockGet = vi.fn();

vi.mock("../../../shell/src/api/client", () => ({
  get: (...args: unknown[]) => mockGet(...args),
  isNotFoundError: (error: unknown) =>
    typeof error === "object" && error !== null && "status" in error &&
    (error as { status: number }).status === 404,
}));

vi.mock("../../../shell/src/shared/components/MentionBadge", () => ({
  default: () => <span />,
}));

vi.mock("../components/EntityDetailFields", () => ({
  default: () => <div />,
}));

vi.mock("./LimsWorkspace", () => ({
  default: () => <div />,
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/lims/ENT-404"]}>
      <Routes>
        <Route path="/lims/:displayId" element={<LimsWorkspacePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("LimsWorkspacePage", () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it("renders the shared not-found state for an entity 404", async () => {
    mockGet.mockRejectedValue({ status: 404 });
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("not-found")).toBeInTheDocument();
    });
    expect(
      screen.getByText("Item not found — or you may not have access"),
    ).toBeInTheDocument();
  });
});
