import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import LimsWorkspacePage from "./LimsWorkspacePage";
import "../index";

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

  it("renders Source Path breadcrumbs with workspace links", async () => {
    mockGet.mockResolvedValue({
      id: 1,
      display_id: "DNA-1",
      name: "Sample A",
      schema: 1,
      schema_name: "DNA",
      schema_prefix: "DNA",
      schema_columns: [],
      schema_icon: "dna",
      schema_color: "muted",
      enabled_components: [],
      properties: {},
      source_entry: null,
      source_entry_display_id: null,
      folder: 2,
      folder_path: "/Legacy",
      source_path: [
        { kind: "project", id: 1, name: "Project", uid: "project-1" },
        { kind: "folder", id: 2, name: "Research" },
        { kind: "entry", id: 3, name: "Entry", display_id: "EXP-1" },
      ],
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

    expect(await screen.findByText("Project").then((node) => node.closest("a"))).toHaveAttribute(
      "href",
      "/library?project=project-1",
    );
    expect(screen.getByText("Research").closest("a")).toHaveAttribute(
      "href",
      "/library?project=project-1&path=%2FResearch",
    );
    expect(screen.getByText("Entry").closest("a")).toHaveAttribute("href", "/eln/EXP-1");
    expect(screen.getAllByText("DNA-1").length).toBeGreaterThan(0);
  });

  it("renders grouped read-only results and skips unknown components", async () => {
    mockGet
      .mockResolvedValueOnce({
        id: 1,
        display_id: "DNA-1",
        name: "Sample A",
        schema: 1,
        schema_name: "DNA",
        schema_columns: [],
        schema_icon: "dna",
        schema_color: "muted",
        enabled_components: ["lims.unknown", "lims.results"],
        properties: {},
        source_entry: null,
        source_entry_display_id: null,
        folder: null,
        folder_path: "",
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
      })
      .mockResolvedValueOnce([
        {
          schema: {
            id: 2,
            name: "Assay results",
            icon: "chart-column",
            color: "muted",
            columns: [
              { name: "Entity", type: "reference" },
              { name: "Value", type: "number" },
            ],
          },
          results: [{
            display_id: "RESULT-1",
            name: "Result one",
            created_at: "2026-01-03T00:00:00Z",
            author_username: "alice",
            properties: { Entity: "DNA-1", Value: 42 },
          }],
        },
      ]);

    renderPage();

    expect(await screen.findByRole("tab", { name: "Results" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Unknown" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Results" }));

    expect(await screen.findByRole("heading", { name: "Assay results" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Value" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Entity" })).not.toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add|insert|new row/i })).not.toBeInTheDocument();
  });

  it("renders one tab-level empty state when there are no results", async () => {
    mockGet
      .mockResolvedValueOnce({
        id: 1,
        display_id: "DNA-1",
        name: "Sample A",
        schema: 1,
        schema_name: "DNA",
        schema_columns: [],
        schema_icon: "dna",
        schema_color: "muted",
        enabled_components: ["lims.results"],
        properties: {},
        source_entry: null,
        source_entry_display_id: null,
        folder: null,
        folder_path: "",
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
      })
      .mockResolvedValueOnce([]);

    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: "Results" }));

    expect(await screen.findByText("No results recorded for this entity.")).toBeInTheDocument();
    expect(screen.queryAllByText("No results recorded for this entity.")).toHaveLength(1);
  });
});
