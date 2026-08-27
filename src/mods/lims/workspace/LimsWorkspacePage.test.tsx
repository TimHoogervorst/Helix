import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import LimsWorkspacePage from "./LimsWorkspacePage";

const mockGet = vi.fn();

vi.mock("../../../shell/src/api/client", () => ({
  get: (...args: unknown[]) => mockGet(...args),
  isNotFoundError: (error: unknown) =>
    typeof error === "object" && error !== null && "status" in error &&
    (error as { status: number }).status === 404,
}));

vi.mock("../blocks/ActivityFeedBlock", () => ({
  ActivityFeedBlock: () => <div data-testid="activity-empty" />,
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
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
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

  it("renders the default entity workspace with metadata and toolbar", async () => {
    mockGet.mockResolvedValue({
      id: 1,
      display_id: "DNA-1",
      name: "Sample A",
      schema: 1,
      schema_name: "DNA",
      schema_prefix: "DNA",
      schema_columns: [{ name: "Concentration", type: "number" }],
      schema_icon: "dna",
      schema_color: "muted",
      enabled_components: [],
      properties: { Concentration: 42 },
      source_entry: null,
      source_entry_display_id: null,
      folder: null,
      folder_path: "/Research",
      project_uid: "project-1",
      author: 1,
      author_username: "alice",
      last_editor: null,
      last_editor_username: null,
      status: "finished",
      updated_at: "2026-01-02T00:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
      tags: [],
      effective_role: "read",
    });

    renderPage();

    expect(await screen.findByRole("heading", { name: "Sample A" })).toBeInTheDocument();
    expect(screen.getByText("Finished")).toBeInTheDocument();
    expect(screen.getByText("Concentration")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("Linked entities")).toBeInTheDocument();
    expect(screen.getByText("Notebook references")).toBeInTheDocument();
    expect(screen.getByText("Research")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Share"));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      `${window.location.origin}/lims/DNA-1`,
    );
  });
});
