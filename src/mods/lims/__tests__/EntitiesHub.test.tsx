import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { EntityHubResponse, EntityHubItem } from "../types";
import EntitiesHub from "../hub/EntitiesHub";

// ── Mocks ────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockGetEntities = vi.fn();
vi.mock("../hub/api", () => ({
  getEntities: (...args: unknown[]) => mockGetEntities(...args),
}));

// Mock localStorage for view mode persistence tests
const localStorageStore: Record<string, string> = {};
const mockLocalStorage = {
  getItem: vi.fn((key: string) => localStorageStore[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageStore[key] = value;
  }),
};
Object.defineProperty(window, "localStorage", {
  value: mockLocalStorage,
  writable: true,
});

// Mock SlotSidebar
vi.mock(
  "../../../shell/src/shared/components/Sidebar/SlotSidebar",
  () => ({
    SlotSidebar: function MockSlotSidebar(_props: { slotId: string }) {
      return (
        <aside data-testid="entities-sidebar">
          <div className="sidebar-section">
            <h3 className="sidebar-section-label">SELECTION</h3>
            <p className="entities-sidebar-placeholder">
              Select an entity to see details.
            </p>
          </div>
          <div className="sidebar-section">
            <h3 className="sidebar-section-label">MY VIEWS</h3>
            <ul className="entities-sidebar-views">
              <li className="entities-sidebar-view-item is-empty">
                No saved views yet.
              </li>
            </ul>
          </div>
          <div className="sidebar-section">
            <h3 className="sidebar-section-label">GLOBAL VIEWS</h3>
            <ul className="entities-sidebar-views">
              <li className="entities-sidebar-view-item is-empty">
                No public views yet.
              </li>
            </ul>
          </div>
        </aside>
      );
    },
  }),
);

// ── Fixtures ─────────────────────────────────────────────────────────

const DEFAULT_COLUMNS: EntityHubResponse["available_columns"] = [
  { key: "display_id", label: "ID", source: "common" },
  { key: "name", label: "Name", source: "common" },
  { key: "schema_type_id", label: "Schema Type", source: "common" },
  { key: "status", label: "Status", source: "common" },
  { key: "author", label: "Author", source: "common" },
  { key: "updated_at", label: "Updated", source: "common" },
];

function makeEntityHubItem(
  overrides?: Partial<EntityHubItem>,
): EntityHubItem {
  return {
    id: 1,
    display_id: "E1",
    name: "Test Entry",
    schema_type_id: "eln.entry",
    schema_type_display: "Entry",
    schema_id: 1,
    schema_name: "Default",
    schema_prefix: "E",
    status: "in_progress",
    author: 1,
    author_username: "testuser",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-03T00:00:00Z",
    workspace_id: "eln",
    ...overrides,
  };
}

function makeEmptyResponse(): EntityHubResponse {
  return {
    results: [],
    total: 0,
    page: 1,
    size: 50,
    available_columns: DEFAULT_COLUMNS,
  };
}

function makePopulatedResponse(
  items: EntityHubItem[],
  overrides?: Partial<EntityHubResponse>,
): EntityHubResponse {
  return {
    results: items,
    total: items.length,
    page: 1,
    size: 50,
    available_columns: DEFAULT_COLUMNS,
    ...overrides,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

function renderHub(initialRoute = "/entities") {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <EntitiesHub />
    </MemoryRouter>,
  );
}

// ── Tests ────────────────────────────────────────────────────────────

describe("EntitiesHub", () => {
  beforeEach(() => {
    mockGetEntities.mockReset();
    mockNavigate.mockReset();
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k]);
    mockLocalStorage.getItem.mockClear();
    mockLocalStorage.setItem.mockClear();
  });

  // ── Loading / Empty / Error states ─────────────────────────────────

  it("shows loading state initially", () => {
    mockGetEntities.mockReturnValue(new Promise(() => {})); // never resolves
    renderHub();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows empty state when no entities exist", async () => {
    mockGetEntities.mockResolvedValue(makeEmptyResponse());
    renderHub();
    await waitFor(() => {
      expect(screen.getByText("No entities found.")).toBeInTheDocument();
    });
  });

  it("shows error message on fetch failure", async () => {
    mockGetEntities.mockRejectedValue(new Error("Network error"));
    renderHub();
    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  // ── Breadcrumb ─────────────────────────────────────────────────────

  it("renders breadcrumb with 'Entities' label", async () => {
    mockGetEntities.mockResolvedValue(makeEmptyResponse());
    renderHub();
    await waitFor(() => {
      expect(screen.getByText("Entities")).toBeInTheDocument();
    });
  });

  // ── View mode toggle ────────────────────────────────────────────────

  it("renders Compact and List view toggle buttons", async () => {
    mockGetEntities.mockResolvedValue(makeEmptyResponse());
    renderHub();
    await waitFor(() => {
      expect(screen.getByTitle("List view")).toBeInTheDocument();
      expect(screen.getByTitle("Compact view")).toBeInTheDocument();
    });
  });

  it("List view is active by default", async () => {
    mockGetEntities.mockResolvedValue(makeEmptyResponse());
    renderHub();
    await waitFor(() => {
      const listBtn = screen.getByTitle("List view");
      expect(listBtn.className).toContain("is-active");
    });
  });

  it("clicking Compact view activates it and deactivates List", async () => {
    mockGetEntities.mockResolvedValue(makeEmptyResponse());
    renderHub();
    await waitFor(() => {
      expect(screen.getByTitle("List view")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle("Compact view"));

    const listBtn = screen.getByTitle("List view");
    const compactBtn = screen.getByTitle("Compact view");
    expect(listBtn.className).not.toContain("is-active");
    expect(compactBtn.className).toContain("is-active");
  });

  it("persists view mode to localStorage", async () => {
    mockGetEntities.mockResolvedValue(makeEmptyResponse());
    renderHub();
    await waitFor(() => {
      expect(screen.getByTitle("List view")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle("Compact view"));

    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      "helix-entities-view-mode",
      "compact",
    );
  });

  it("restores view mode from localStorage on mount", async () => {
    localStorageStore["helix-entities-view-mode"] = "compact";
    mockLocalStorage.getItem.mockImplementation(
      (key: string) => localStorageStore[key] ?? null,
    );

    mockGetEntities.mockResolvedValue(makeEmptyResponse());
    renderHub();
    await waitFor(() => {
      const compactBtn = screen.getByTitle("Compact view");
      expect(compactBtn.className).toContain("is-active");
    });
  });

  it("view mode toggle does NOT trigger a data refetch", async () => {
    mockGetEntities.mockResolvedValue(makeEmptyResponse());
    renderHub();
    await waitFor(() => {
      expect(screen.getByTitle("List view")).toBeInTheDocument();
    });

    const callCount = mockGetEntities.mock.calls.length;

    fireEvent.click(screen.getByTitle("Compact view"));
    fireEvent.click(screen.getByTitle("List view"));

    expect(mockGetEntities.mock.calls.length).toBe(callCount);
  });

  // ── Data Table ──────────────────────────────────────────────────────

  it("renders entity rows in a table", async () => {
    const items = [
      makeEntityHubItem({ id: 1, display_id: "E1", name: "First" }),
      makeEntityHubItem({
        id: 2,
        display_id: "BLOOD1",
        name: "Blood Sample",
        schema_type_id: "lims.entity",
        schema_type_display: "LIMS Entity",
        workspace_id: "lims",
      }),
    ];
    mockGetEntities.mockResolvedValue(makePopulatedResponse(items));
    renderHub();
    await waitFor(() => {
      expect(screen.getByText("E1")).toBeInTheDocument();
      expect(screen.getByText("First")).toBeInTheDocument();
      expect(screen.getByText("BLOOD1")).toBeInTheDocument();
      expect(screen.getByText("Blood Sample")).toBeInTheDocument();
    });
  });

  it("renders schema type badges", async () => {
    const items = [
      makeEntityHubItem({ id: 1, schema_type_display: "Entry" }),
      makeEntityHubItem({
        id: 2,
        schema_type_id: "lims.entity",
        schema_type_display: "LIMS Entity",
      }),
    ];
    mockGetEntities.mockResolvedValue(makePopulatedResponse(items));
    renderHub();
    await waitFor(() => {
      expect(screen.getByText("Entry")).toBeInTheDocument();
      expect(screen.getByText("LIMS Entity")).toBeInTheDocument();
    });
  });

  it("renders status badges", async () => {
    const items = [
      makeEntityHubItem({ id: 1, status: "in_progress" }),
      makeEntityHubItem({ id: 2, status: "finished" }),
    ];
    mockGetEntities.mockResolvedValue(makePopulatedResponse(items));
    renderHub();
    await waitFor(() => {
      expect(screen.getByText("In Progress")).toBeInTheDocument();
      expect(screen.getByText("Finished")).toBeInTheDocument();
    });
  });

  it("renders author username", async () => {
    const items = [makeEntityHubItem({ id: 1, author_username: "testuser" })];
    mockGetEntities.mockResolvedValue(makePopulatedResponse(items));
    renderHub();
    await waitFor(() => {
      expect(screen.getByText("testuser")).toBeInTheDocument();
    });
  });

  it("renders em dash for null author", async () => {
    const items = [
      makeEntityHubItem({ id: 1, author_username: null, author: null }),
    ];
    mockGetEntities.mockResolvedValue(makePopulatedResponse(items));
    renderHub();
    await waitFor(() => {
      expect(screen.getByText("—")).toBeInTheDocument();
    });
  });

  // ── Row click → navigation ──────────────────────────────────────────

  it("navigates to workspace URL on row click", async () => {
    const items = [
      makeEntityHubItem({
        id: 1,
        display_id: "E1",
        workspace_id: "eln",
      }),
    ];
    mockGetEntities.mockResolvedValue(makePopulatedResponse(items));
    renderHub();
    await waitFor(() => {
      expect(screen.getByText("E1")).toBeInTheDocument();
    });

    // Click the row (find by display_id text then click parent row)
    const row = screen.getByText("E1").closest("tr");
    expect(row).not.toBeNull();
    fireEvent.click(row!);

    expect(mockNavigate).toHaveBeenCalledWith("/eln/E1");
  });

  it("navigates to LIMS workspace for lims.entity rows", async () => {
    const items = [
      makeEntityHubItem({
        id: 2,
        display_id: "BLOOD1",
        workspace_id: "lims",
        schema_type_id: "lims.entity",
        schema_type_display: "LIMS Entity",
      }),
    ];
    mockGetEntities.mockResolvedValue(makePopulatedResponse(items));
    renderHub();
    await waitFor(() => {
      expect(screen.getByText("BLOOD1")).toBeInTheDocument();
    });

    const row = screen.getByText("BLOOD1").closest("tr");
    fireEvent.click(row!);

    expect(mockNavigate).toHaveBeenCalledWith("/lims/BLOOD1");
  });

  it("supports keyboard navigation (Enter key) on rows", async () => {
    const items = [
      makeEntityHubItem({ id: 1, display_id: "E1", workspace_id: "eln" }),
    ];
    mockGetEntities.mockResolvedValue(makePopulatedResponse(items));
    renderHub();
    await waitFor(() => {
      expect(screen.getByText("E1")).toBeInTheDocument();
    });

    const row = screen.getByText("E1").closest("tr");
    fireEvent.keyDown(row!, { key: "Enter" });

    expect(mockNavigate).toHaveBeenCalledWith("/eln/E1");
  });

  // ── Filter bar stubs ────────────────────────────────────────────────

  it("renders search input (disabled)", async () => {
    mockGetEntities.mockResolvedValue(makeEmptyResponse());
    renderHub();
    await waitFor(() => {
      const searchInput = screen.getByPlaceholderText("Search…");
      expect(searchInput).toBeInTheDocument();
      expect(searchInput).toBeDisabled();
    });
  });

  it("renders Schema dropdown (disabled, empty)", async () => {
    mockGetEntities.mockResolvedValue(makeEmptyResponse());
    renderHub();
    await waitFor(() => {
      const selects = screen.getAllByRole("combobox");
      const schemaSelect = selects.find((s) =>
        s.querySelector("option")?.textContent === "Schema",
      );
      expect(schemaSelect).toBeDefined();
      expect(schemaSelect).toBeDisabled();
    });
  });

  it("renders Sort button (disabled)", async () => {
    mockGetEntities.mockResolvedValue(makeEmptyResponse());
    renderHub();
    await waitFor(() => {
      expect(screen.getByText("Sort")).toBeInTheDocument();
      expect(screen.getByText("Sort").closest("button")).toBeDisabled();
    });
  });

  it("renders column chooser button (disabled)", async () => {
    mockGetEntities.mockResolvedValue(makeEmptyResponse());
    renderHub();
    await waitFor(() => {
      const columnsBtn = screen.getByTitle("Column visibility");
      expect(columnsBtn).toBeInTheDocument();
      expect(columnsBtn).toBeDisabled();
    });
  });

  // ── Right sidebar ───────────────────────────────────────────────────

  it("renders SELECTION section placeholder", async () => {
    mockGetEntities.mockResolvedValue(makeEmptyResponse());
    renderHub();
    await waitFor(() => {
      expect(screen.getByText("SELECTION")).toBeInTheDocument();
      expect(
        screen.getByText("Select an entity to see details."),
      ).toBeInTheDocument();
    });
  });

  it("renders MY VIEWS section placeholder", async () => {
    mockGetEntities.mockResolvedValue(makeEmptyResponse());
    renderHub();
    await waitFor(() => {
      expect(screen.getByText("MY VIEWS")).toBeInTheDocument();
      expect(screen.getByText("No saved views yet.")).toBeInTheDocument();
    });
  });

  it("renders GLOBAL VIEWS section placeholder", async () => {
    mockGetEntities.mockResolvedValue(makeEmptyResponse());
    renderHub();
    await waitFor(() => {
      expect(screen.getByText("GLOBAL VIEWS")).toBeInTheDocument();
      expect(screen.getByText("No public views yet.")).toBeInTheDocument();
    });
  });

  // ── Pagination ──────────────────────────────────────────────────────

  it("renders page size selector", async () => {
    const items = [makeEntityHubItem({ id: 1 })];
    mockGetEntities.mockResolvedValue(makePopulatedResponse(items));
    renderHub();
    await waitFor(() => {
      expect(screen.getByText("Show")).toBeInTheDocument();
    });
  });

  it("renders total count", async () => {
    const items = [makeEntityHubItem({ id: 1 })];
    mockGetEntities.mockResolvedValue(
      makePopulatedResponse(items, { total: 142 }),
    );
    renderHub();
    await waitFor(() => {
      expect(screen.getByText("142 total")).toBeInTheDocument();
    });
  });

  it("does not render pagination when no results", async () => {
    mockGetEntities.mockResolvedValue(makeEmptyResponse());
    renderHub();
    await waitFor(() => {
      expect(screen.getByText("No entities found.")).toBeInTheDocument();
    });
    expect(screen.queryByText("Show")).not.toBeInTheDocument();
  });

  // ── Compact view applies class ──────────────────────────────────────

  it("applies view-compact class to table wrapper in compact mode", async () => {
    localStorageStore["helix-entities-view-mode"] = "compact";
    mockLocalStorage.getItem.mockImplementation(
      (key: string) => localStorageStore[key] ?? null,
    );

    const items = [makeEntityHubItem({ id: 1 })];
    mockGetEntities.mockResolvedValue(makePopulatedResponse(items));
    renderHub();
    await waitFor(() => {
      expect(screen.getByText("E1")).toBeInTheDocument();
    });

    const tableWrap = document.querySelector(".entities-table-wrap");
    expect(tableWrap?.className).toContain("view-compact");
  });
});
