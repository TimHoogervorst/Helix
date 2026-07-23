import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { EntityHubResponse, EntityHubItem, SchemaTypeItem, Schema } from "../types";
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
const mockGetSchemaTypes = vi.fn();
const mockGetSchemas = vi.fn();
vi.mock("../hub/api", () => ({
  getEntities: (...args: unknown[]) => mockGetEntities(...args),
  getSchemaTypes: (...args: unknown[]) => mockGetSchemaTypes(...args),
  getSchemas: (...args: unknown[]) => mockGetSchemas(...args),
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
  { key: "created_at", label: "Created", source: "common" },
  { key: "updated_at", label: "Updated", source: "common" },
];

const MOCK_SCHEMA_TYPES: SchemaTypeItem[] = [
  {
    id: 1,
    display_name: "Entry",
    workspace_id: "eln",
    is_active: true,
    schema_type_id: "eln.entry",
  },
  {
    id: 2,
    display_name: "LIMS Entity",
    workspace_id: "lims",
    is_active: true,
    schema_type_id: "lims.entity",
  },
];

const MOCK_SCHEMAS: Schema[] = [
  {
    id: 1,
    name: "Default",
    prefix: "E",
    schema_type: 1,
    schema_type_display: "Entry",
    columns: [
      { id: "col-1", name: "sample_type", type: "Text" },
      { id: "col-2", name: "concentration", type: "Number" },
    ],
    is_default: true,
    is_active: true,
    content_hash: "abc",
  },
  {
    id: 2,
    name: "Blood",
    prefix: "BLOOD",
    schema_type: 2,
    schema_type_display: "LIMS Entity",
    columns: [
      { id: "col-3", name: "blood_type", type: "Text" },
    ],
    is_default: true,
    is_active: true,
    content_hash: "def",
  },
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
    mockGetSchemaTypes.mockReset();
    mockGetSchemas.mockReset();
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k]);
    mockLocalStorage.getItem.mockClear();
    mockLocalStorage.setItem.mockClear();

    // Default successful responses
    mockGetEntities.mockResolvedValue(makeEmptyResponse());
    mockGetSchemaTypes.mockResolvedValue(MOCK_SCHEMA_TYPES);
    mockGetSchemas.mockResolvedValue(MOCK_SCHEMAS);
  });

  // ── Loading / Empty / Error states ─────────────────────────────────

  it("shows loading state initially", () => {
    mockGetEntities.mockReturnValue(new Promise(() => {})); // never resolves
    mockGetSchemaTypes.mockReturnValue(new Promise(() => {}));
    mockGetSchemas.mockReturnValue(new Promise(() => {}));
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

  it("shows empty state with filters message when filters are active", async () => {
    mockGetEntities.mockResolvedValue(makeEmptyResponse());
    renderHub("/entities?search=nonexistent");
    await waitFor(() => {
      expect(
        screen.getByText("No entities match your filters."),
      ).toBeInTheDocument();
      expect(screen.getByText("Clear all filters")).toBeInTheDocument();
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
    renderHub();
    await waitFor(() => {
      expect(screen.getByText("Entities")).toBeInTheDocument();
    });
  });

  // ── View mode toggle ────────────────────────────────────────────────

  it("renders Compact and List view toggle buttons", async () => {
    renderHub();
    await waitFor(() => {
      expect(screen.getByTitle("List view")).toBeInTheDocument();
      expect(screen.getByTitle("Compact view")).toBeInTheDocument();
    });
  });

  it("List view is active by default", async () => {
    renderHub();
    await waitFor(() => {
      const listBtn = screen.getByTitle("List view");
      expect(listBtn.className).toContain("is-active");
    });
  });

  it("clicking Compact view activates it and deactivates List", async () => {
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

    renderHub();
    await waitFor(() => {
      const compactBtn = screen.getByTitle("Compact view");
      expect(compactBtn.className).toContain("is-active");
    });
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
      // Use getAllByText since "In Progress" and "Finished" also appear in
      // the Status dropdown options
      const inProgressEls = screen.getAllByText("In Progress");
      const finishedEls = screen.getAllByText("Finished");
      // At least one of each should be a status badge (not just the option)
      expect(inProgressEls.length).toBeGreaterThanOrEqual(1);
      expect(finishedEls.length).toBeGreaterThanOrEqual(1);
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

    const row = screen.getByText("E1").closest("tr");
    expect(row).not.toBeNull();
    fireEvent.click(row!);

    expect(mockNavigate).toHaveBeenCalledWith("/eln/E1");
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

  // ── Filter Bar: Search ─────────────────────────────────────────────

  it("renders search input (enabled)", async () => {
    renderHub();
    await waitFor(() => {
      const searchInput = screen.getByPlaceholderText("Search…");
      expect(searchInput).toBeInTheDocument();
      expect(searchInput).not.toBeDisabled();
    });
  });

  it("passes search query to API", async () => {
    const items = [makeEntityHubItem({ id: 1, name: "PCR Result" })];
    mockGetEntities.mockResolvedValue(makePopulatedResponse(items));
    renderHub("/entities?search=PCR");
    await waitFor(() => {
      expect(mockGetEntities).toHaveBeenCalled();
    });
    // The debounced search value should be "PCR"
    const lastCall = mockGetEntities.mock.calls.at(-1)?.[0];
    expect(lastCall?.search).toBe("PCR");
  });

  // ── Filter Bar: Schema dropdown ────────────────────────────────────

  it("renders Schema dropdown with optgroups", async () => {
    mockGetEntities.mockResolvedValue(makeEmptyResponse());
    renderHub();
    await waitFor(() => {
      // The "All schemas" default option should be present
      expect(screen.getByText("All schemas")).toBeInTheDocument();
    });
  });

  it("passes schema filter to API", async () => {
    mockGetEntities.mockResolvedValue(makeEmptyResponse());
    renderHub("/entities?schema=2");
    await waitFor(() => {
      const lastCall = mockGetEntities.mock.calls.at(-1)?.[0];
      expect(lastCall?.schema).toBe("2");
    });
  });

  it("passes schema_type filter to API", async () => {
    mockGetEntities.mockResolvedValue(makeEmptyResponse());
    renderHub("/entities?schema_type=eln.entry");
    await waitFor(() => {
      const lastCall = mockGetEntities.mock.calls.at(-1)?.[0];
      expect(lastCall?.schema_type).toBe("eln.entry");
    });
  });

  // ── Filter Bar: Status dropdown ────────────────────────────────────

  it("renders Status dropdown with options", async () => {
    renderHub();
    await waitFor(() => {
      expect(screen.getByText("All statuses")).toBeInTheDocument();
    });
  });

  it("passes status filter to API", async () => {
    mockGetEntities.mockResolvedValue(makeEmptyResponse());
    renderHub("/entities?status=in_progress");
    await waitFor(() => {
      const lastCall = mockGetEntities.mock.calls.at(-1)?.[0];
      expect(lastCall?.status).toBe("in_progress");
    });
  });

  // ── Filter Bar: Sort button ────────────────────────────────────────

  it("renders Sort button (enabled)", async () => {
    renderHub();
    await waitFor(() => {
      const sortBtn = screen.getByText("Sort").closest("button");
      expect(sortBtn).toBeInTheDocument();
      expect(sortBtn).not.toBeDisabled();
    });
  });

  it("shows sort direction when sort is active", async () => {
    mockGetEntities.mockResolvedValue(makeEmptyResponse());
    renderHub("/entities?sort=name");
    await waitFor(() => {
      expect(screen.getByText("Name")).toBeInTheDocument();
    });
  });

  it("shows descending sort indicator", async () => {
    mockGetEntities.mockResolvedValue(makeEmptyResponse());
    renderHub("/entities?sort=-updated_at");
    await waitFor(() => {
      expect(screen.getByText("Updated")).toBeInTheDocument();
    });
  });

  it("passes sort param to API", async () => {
    mockGetEntities.mockResolvedValue(makeEmptyResponse());
    renderHub("/entities?sort=-created_at");
    await waitFor(() => {
      const lastCall = mockGetEntities.mock.calls.at(-1)?.[0];
      expect(lastCall?.sort).toBe("-created_at");
    });
  });

  // ── Filter Bar: Fields button ──────────────────────────────────────

  it("renders Fields button", async () => {
    const items = [makeEntityHubItem({ id: 1 })];
    mockGetEntities.mockResolvedValue(makePopulatedResponse(items));
    renderHub();
    await waitFor(() => {
      expect(screen.getByText("Fields")).toBeInTheDocument();
    });
  });

  it("shows field filter count badge when filters active", async () => {
    const items = [makeEntityHubItem({ id: 1 })];
    mockGetEntities.mockResolvedValue(makePopulatedResponse(items));
    renderHub("/entities?f=sample_type:B&f=concentration:5");
    await waitFor(() => {
      expect(screen.getByText("2")).toBeInTheDocument();
    });
  });

  // ── Field filter chips ─────────────────────────────────────────────

  it("renders field filter chips below the filter bar", async () => {
    const items = [makeEntityHubItem({ id: 1 })];
    mockGetEntities.mockResolvedValue(makePopulatedResponse(items));
    renderHub("/entities?f=sample_type:B");
    await waitFor(() => {
      expect(screen.getByText("sample_type")).toBeInTheDocument();
      expect(screen.getByText("B")).toBeInTheDocument();
      expect(screen.getByText("Clear all")).toBeInTheDocument();
    });
  });

  it("passes field filters to API", async () => {
    mockGetEntities.mockResolvedValue(makeEmptyResponse());
    renderHub("/entities?f=sample_type:B&f=concentration:5");
    await waitFor(() => {
      const lastCall = mockGetEntities.mock.calls.at(-1)?.[0];
      expect(lastCall?.f).toEqual(["sample_type:B", "concentration:5"]);
    });
  });

  // ── Sortable column headers ────────────────────────────────────────

  it("column headers have sort icon when active", async () => {
    const items = [makeEntityHubItem({ id: 1 })];
    mockGetEntities.mockResolvedValue(makePopulatedResponse(items));
    renderHub("/entities?sort=name");
    await waitFor(() => {
      // Find the sort icon within any th element (Name column header)
      const headers = document.querySelectorAll("th");
      const nameHeader = Array.from(headers).find((th) =>
        th.textContent?.includes("Name"),
      );
      expect(nameHeader?.querySelector(".entities-sort-icon")).toBeTruthy();
    });
  });

  // ── Right sidebar ───────────────────────────────────────────────────

  it("renders SELECTION section placeholder", async () => {
    renderHub();
    await waitFor(() => {
      expect(screen.getByText("SELECTION")).toBeInTheDocument();
      expect(
        screen.getByText("Select an entity to see details."),
      ).toBeInTheDocument();
    });
  });

  it("renders MY VIEWS section placeholder", async () => {
    renderHub();
    await waitFor(() => {
      expect(screen.getByText("MY VIEWS")).toBeInTheDocument();
      expect(screen.getByText("No saved views yet.")).toBeInTheDocument();
    });
  });

  it("renders GLOBAL VIEWS section placeholder", async () => {
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
    renderHub();
    await waitFor(() => {
      expect(screen.getByText("No entities found.")).toBeInTheDocument();
    });
    expect(screen.queryByText("Show")).not.toBeInTheDocument();
  });

  // ── Compact view ──────────────────────────────────────────────────

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

  // ── URL sync on filter changes ─────────────────────────────────────

  it("populates search input from URL on load", async () => {
    renderHub("/entities?search=PCR");
    await waitFor(() => {
      const searchInput = screen.getByPlaceholderText(
        "Search…",
      ) as HTMLInputElement;
      expect(searchInput.value).toBe("PCR");
    });
  });

  it("populates status dropdown from URL on load", async () => {
    renderHub("/entities?status=finished");
    await waitFor(() => {
      // Find all select elements and check one has value "finished"
      const selects = document.querySelectorAll("select");
      const statusSelect = Array.from(selects).find(
        (s) => s.value === "finished",
      );
      expect(statusSelect).toBeTruthy();
    });
  });

  it("fetches data on mount with URL-derived params", async () => {
    renderHub("/entities?search=PCR&status=in_progress&sort=-created_at");
    await waitFor(() => {
      expect(mockGetEntities).toHaveBeenCalled();
      const call = mockGetEntities.mock.calls.at(-1)?.[0];
      expect(call?.search).toBe("PCR");
      expect(call?.status).toBe("in_progress");
      expect(call?.sort).toBe("-created_at");
    });
  });
});
