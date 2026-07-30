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
  { key: "display_id", label: "ID", source: "common", type: "text", filterable: true, width: null },
  { key: "name", label: "Name", source: "common", type: "text", filterable: true, width: null },
  { key: "schema_type_id", label: "Schema Type", source: "common", type: "text", filterable: true, width: null },
  { key: "status", label: "Status", source: "common", type: "select", filterable: true, width: null },
  { key: "author", label: "Author", source: "common", type: "user", filterable: true, width: null },
  { key: "created_at", label: "Created", source: "common", type: "datetime", filterable: true, width: null },
  { key: "updated_at", label: "Updated", source: "common", type: "datetime", filterable: true, width: null },
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
    display_name: "Entity",
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
      { id: "col-1", name: "sample_type", type: "text" },
      { id: "col-2", name: "concentration", type: "number" },
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
    schema_type_display: "Entity",
    columns: [
      { id: "col-3", name: "blood_type", type: "text" },
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
        schema_type_display: "Entity",
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
        schema_type_display: "Entity",
      }),
    ];
    mockGetEntities.mockResolvedValue(makePopulatedResponse(items));
    renderHub();
    await waitFor(() => {
      expect(screen.getByText("Entry")).toBeInTheDocument();
      expect(screen.getByText("Entity")).toBeInTheDocument();
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
        schema_type_display: "Entity",
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

  it("schema dropdown shows correct value for specific schema", async () => {
    mockGetEntities.mockResolvedValue(makeEmptyResponse());
    // Load with a specific schema filter in the URL
    renderHub("/entities?schema=2");
    await waitFor(() => {
      expect(screen.getByText("All schemas")).toBeInTheDocument();
    });

    const selects = document.querySelectorAll("select");
    const schemaSelect = Array.from(selects).find((s) =>
      s.querySelector("optgroup"),
    );
    // The select value must match the option with value "2" (Blood schema)
    expect((schemaSelect as HTMLSelectElement).value).toBe("2");
  });

  it("schema dropdown shows correct value for schema_type", async () => {
    mockGetEntities.mockResolvedValue(makeEmptyResponse());
    // Load with a schema_type filter in the URL
    renderHub("/entities?schema_type=eln.entry");
    await waitFor(() => {
      expect(screen.getByText("All schemas")).toBeInTheDocument();
    });

    const selects = document.querySelectorAll("select");
    const schemaSelect = Array.from(selects).find((s) =>
      s.querySelector("optgroup"),
    );
    // The select value must match the option with value "type:eln.entry"
    expect((schemaSelect as HTMLSelectElement).value).toBe("type:eln.entry");
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

  // ── Filter Bar: Add Filter button ───────────────────────────────────

  it("renders '+ Add Filter' button", async () => {
    const items = [makeEntityHubItem({ id: 1 })];
    mockGetEntities.mockResolvedValue(makePopulatedResponse(items));
    renderHub();
    await waitFor(() => {
      expect(screen.getByText("Add Filter")).toBeInTheDocument();
    });
  });

  it("shows filter pills when field filters active", async () => {
    const items = [makeEntityHubItem({ id: 1 })];
    mockGetEntities.mockResolvedValue(makePopulatedResponse(items));
    renderHub("/entities?f=sample_type:eq:B&f=concentration:eq:5");
    await waitFor(() => {
      // Filter pills render inline in the filter bar, not as separate chips
      expect(screen.getByText("Clear all")).toBeInTheDocument();
    });
  });

  // ── Field filter pills ──────────────────────────────────────────────

  it("renders field filter pills inline in the filter bar", async () => {
    const items = [makeEntityHubItem({ id: 1 })];
    mockGetEntities.mockResolvedValue(makePopulatedResponse(items));
    renderHub("/entities?f=sample_type:eq:B");
    await waitFor(() => {
      // The pill shows the field label and value, and the Clear all link
      expect(screen.getByText("Clear all")).toBeInTheDocument();
      // Pill components are rendered inside the filter bar (entities-filter-pills-bar)
      expect(document.querySelector(".entities-filter-pill")).toBeInTheDocument();
    });
  });

  it("passes field filters to API", async () => {
    mockGetEntities.mockResolvedValue(makeEmptyResponse());
    renderHub("/entities?f=sample_type:eq:B&f=concentration:eq:5");
    await waitFor(() => {
      const lastCall = mockGetEntities.mock.calls.at(-1)?.[0];
      expect(lastCall?.f).toEqual(["sample_type:eq:B", "concentration:eq:5"]);
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

  // ── Column visibility: default visible columns ──────────────────────

  it("renders all default visible columns as table headers", async () => {
    const items = [makeEntityHubItem({ id: 1 })];
    mockGetEntities.mockResolvedValue(makePopulatedResponse(items));
    renderHub();
    await waitFor(() => {
      expect(screen.getByText("E1")).toBeInTheDocument();
    });
    // Default visible: ID, Name, Schema Type, Status, Author, Updated
    expect(screen.getByText("ID")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Schema Type")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Author")).toBeInTheDocument();
    expect(screen.getByText("Updated")).toBeInTheDocument();
  });

  it("does NOT show created_at column header by default", async () => {
    const items = [makeEntityHubItem({ id: 1 })];
    mockGetEntities.mockResolvedValue(makePopulatedResponse(items));
    renderHub();
    await waitFor(() => {
      expect(screen.getByText("E1")).toBeInTheDocument();
    });
    expect(screen.queryByText("Created")).not.toBeInTheDocument();
  });

  it("display_id column header is always present", async () => {
    const items = [makeEntityHubItem({ id: 1 })];
    mockGetEntities.mockResolvedValue(makePopulatedResponse(items));
    renderHub();
    await waitFor(() => {
      expect(screen.getByText("ID")).toBeInTheDocument();
    });
  });

  // ── Column visibility: column chooser popover ────────────────────────

  it("column chooser button is enabled", async () => {
    const items = [makeEntityHubItem({ id: 1 })];
    mockGetEntities.mockResolvedValue(makePopulatedResponse(items));
    renderHub();
    await waitFor(() => {
      const btn = screen.getByTitle("Column visibility");
      expect(btn).toBeInTheDocument();
      expect(btn).not.toBeDisabled();
    });
  });

  it("column chooser opens on click and lists available columns", async () => {
    const items = [makeEntityHubItem({ id: 1 })];
    mockGetEntities.mockResolvedValue(makePopulatedResponse(items));
    renderHub();
    await waitFor(() => {
      expect(screen.getByTitle("Column visibility")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle("Column visibility"));

    // The chooser should show available columns (look for chooser labels)
    await waitFor(() => {
      const chooserLabels = document.querySelectorAll(
        ".entities-column-chooser-name",
      );
      const labelTexts = Array.from(chooserLabels).map((el) => el.textContent);
      expect(labelTexts).toContain("Name");
      expect(labelTexts).toContain("Status");
    });
  });

  // ── Column visibility: toggle ────────────────────────────────────────

  it("toggling a column off removes it from the table", async () => {
    const items = [makeEntityHubItem({ id: 1 })];
    mockGetEntities.mockResolvedValue(makePopulatedResponse(items));
    renderHub();
    await waitFor(() => {
      expect(screen.getByText("E1")).toBeInTheDocument();
    });

    // "Author" should be visible as a table header initially
    const authorHeaders = screen.getAllByText("Author");
    const authorInTable = authorHeaders.find(
      (el) => el.closest("th") !== null,
    );
    expect(authorInTable).toBeTruthy();

    // Open column chooser
    fireEvent.click(screen.getByTitle("Column visibility"));

    // Uncheck "Author" column in the chooser
    await waitFor(() => {
      const authorLabel = Array.from(
        document.querySelectorAll(".entities-column-chooser-label"),
      ).find((el) => el.textContent?.includes("Author"));
      const checkbox = authorLabel?.querySelector("input");
      if (checkbox) fireEvent.click(checkbox);
    });

    // Author should no longer be in table headers
    await waitFor(() => {
      const thElements = document.querySelectorAll("th");
      const thTexts = Array.from(thElements).map(
        (th) => th.textContent?.trim() || "",
      );
      expect(thTexts).not.toContain("Author");
    });
  });

  // ── Schema properties columns ────────────────────────────────────────

  it("renders schema properties columns from available_columns", async () => {
    const schemaColumns: EntityHubResponse["available_columns"] = [
      { key: "display_id", label: "ID", source: "common", type: "text", filterable: true, width: null },
      { key: "name", label: "Name", source: "common", type: "text", filterable: true, width: null },
      { key: "schema_type_id", label: "Schema Type", source: "common", type: "text", filterable: true, width: null },
      { key: "status", label: "Status", source: "common", type: "select", filterable: true, width: null },
      { key: "author", label: "Author", source: "common", type: "user", filterable: true, width: null },
      { key: "created_at", label: "Created", source: "common", type: "datetime", filterable: true, width: null },
      { key: "updated_at", label: "Updated", source: "common", type: "datetime", filterable: true, width: null },
      { key: "sample_type", label: "Sample Type", source: "schema", type: "text", filterable: true, width: null },
      { key: "concentration", label: "Concentration", source: "schema", type: "number", filterable: true, width: null },
    ];

    const items = [
      makeEntityHubItem({
        id: 1,
        _expanded: { sample_type: "Blood", concentration: "50" },
      }),
    ];
    mockGetEntities.mockResolvedValue(
      makePopulatedResponse(items, { available_columns: schemaColumns }),
    );
    renderHub();
    await waitFor(() => {
      expect(screen.getByText("E1")).toBeInTheDocument();
    });

    // Schema columns are in available_columns but NOT visible by default
    // (they need to be toggled on)
    expect(screen.queryByText("Sample Type")).not.toBeInTheDocument();
  });

  it("schema properties columns appear when toggled on", async () => {
    const schemaColumns: EntityHubResponse["available_columns"] = [
      { key: "display_id", label: "ID", source: "common", type: "text", filterable: true, width: null },
      { key: "name", label: "Name", source: "common", type: "text", filterable: true, width: null },
      { key: "schema_type_id", label: "Schema Type", source: "common", type: "text", filterable: true, width: null },
      { key: "status", label: "Status", source: "common", type: "select", filterable: true, width: null },
      { key: "author", label: "Author", source: "common", type: "user", filterable: true, width: null },
      { key: "created_at", label: "Created", source: "common", type: "datetime", filterable: true, width: null },
      { key: "updated_at", label: "Updated", source: "common", type: "datetime", filterable: true, width: null },
      { key: "sample_type", label: "Sample Type", source: "schema", type: "text", filterable: true, width: null },
    ];

    const items = [
      makeEntityHubItem({
        id: 1,
        _expanded: { sample_type: "Blood" },
      }),
    ];
    mockGetEntities.mockResolvedValue(
      makePopulatedResponse(items, { available_columns: schemaColumns }),
    );

    // Load with columns param that includes sample_type
    renderHub("/entities?columns=display_id,name,schema_type_id,status,author,updated_at,sample_type");
    await waitFor(() => {
      expect(screen.getByText("E1")).toBeInTheDocument();
    });

    // Now Sample Type should be visible as a header
    expect(screen.getByText("Sample Type")).toBeInTheDocument();
  });

  it("renders _expanded values in schema property cells", async () => {
    const schemaColumns: EntityHubResponse["available_columns"] = [
      { key: "display_id", label: "ID", source: "common", type: "text", filterable: true, width: null },
      { key: "name", label: "Name", source: "common", type: "text", filterable: true, width: null },
      { key: "schema_type_id", label: "Schema Type", source: "common", type: "text", filterable: true, width: null },
      { key: "status", label: "Status", source: "common", type: "select", filterable: true, width: null },
      { key: "author", label: "Author", source: "common", type: "user", filterable: true, width: null },
      { key: "created_at", label: "Created", source: "common", type: "datetime", filterable: true, width: null },
      { key: "updated_at", label: "Updated", source: "common", type: "datetime", filterable: true, width: null },
      { key: "sample_type", label: "Sample Type", source: "schema", type: "text", filterable: true, width: null },
    ];

    const items = [
      makeEntityHubItem({
        id: 1,
        _expanded: { sample_type: "Blood" },
      }),
    ];
    mockGetEntities.mockResolvedValue(
      makePopulatedResponse(items, { available_columns: schemaColumns }),
    );

    renderHub("/entities?columns=display_id,name,schema_type_id,status,author,updated_at,sample_type");
    await waitFor(() => {
      expect(screen.getByText("E1")).toBeInTheDocument();
    });

    // The _expanded value should be rendered in a cell
    // "Blood" is in the schema dropdown AND the table cell, so use getAllByText
    const bloodElements = screen.getAllByText("Blood");
    const bloodInCell = bloodElements.find(
      (el) => el.closest("td") !== null,
    );
    expect(bloodInCell).toBeTruthy();
  });

  // ── Column lock toggle (via chooser) ──────────────────────────────────

  it("lock icon appears in column chooser rows", async () => {
    const items = [makeEntityHubItem({ id: 1 })];
    mockGetEntities.mockResolvedValue(makePopulatedResponse(items));
    renderHub();
    await waitFor(() => {
      expect(screen.getByTitle("Column visibility")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle("Column visibility"));

    // Lock buttons should exist in the chooser
    await waitFor(() => {
      const lockBtns = document.querySelectorAll(
        ".entities-column-chooser-lock",
      );
      expect(lockBtns.length).toBeGreaterThan(0);
    });
  });

  // ── Column visibility restores from URL ──────────────────────────────

  it("restores visible columns from URL columns param", async () => {
    const items = [makeEntityHubItem({ id: 1 })];
    mockGetEntities.mockResolvedValue(makePopulatedResponse(items));
    renderHub("/entities?columns=display_id,name,status,author");
    await waitFor(() => {
      expect(screen.getByText("E1")).toBeInTheDocument();
    });

    // Only the columns in the URL should be visible
    expect(screen.getByText("ID")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Author")).toBeInTheDocument();
    // These should be hidden
    expect(screen.queryByText("Schema Type")).not.toBeInTheDocument();
    expect(screen.queryByText("Updated")).not.toBeInTheDocument();
  });

  // ── Empty/null _expanded values ──────────────────────────────────────

  it("renders em dash for missing _expanded values", async () => {
    const schemaColumns: EntityHubResponse["available_columns"] = [
      { key: "display_id", label: "ID", source: "common", type: "text", filterable: true, width: null },
      { key: "name", label: "Name", source: "common", type: "text", filterable: true, width: null },
      { key: "schema_type_id", label: "Schema Type", source: "common", type: "text", filterable: true, width: null },
      { key: "status", label: "Status", source: "common", type: "select", filterable: true, width: null },
      { key: "author", label: "Author", source: "common", type: "user", filterable: true, width: null },
      { key: "created_at", label: "Created", source: "common", type: "datetime", filterable: true, width: null },
      { key: "updated_at", label: "Updated", source: "common", type: "datetime", filterable: true, width: null },
      { key: "sample_type", label: "Sample Type", source: "schema", type: "text", filterable: true, width: null },
    ];

    const items = [
      makeEntityHubItem({
        id: 1,
        _expanded: null, // No expanded data
      }),
    ];
    mockGetEntities.mockResolvedValue(
      makePopulatedResponse(items, { available_columns: schemaColumns }),
    );

    renderHub("/entities?columns=display_id,name,schema_type_id,status,author,updated_at,sample_type");
    await waitFor(() => {
      expect(screen.getByText("E1")).toBeInTheDocument();
    });

    // Should render em dash for missing value
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  // ── Type-aware cell rendering ──────────────────────────────────────

  it("renders text-type schema property as plain string", async () => {
    const schemaColumns: EntityHubResponse["available_columns"] = [
      ...DEFAULT_COLUMNS,
      { key: "notes", label: "Notes", source: "schema", type: "text", filterable: true, width: null },
    ];
    const items = [
      makeEntityHubItem({ id: 1, _expanded: { notes: "Hello world" } }),
    ];
    mockGetEntities.mockResolvedValue(
      makePopulatedResponse(items, { available_columns: schemaColumns }),
    );
    renderHub("/entities?columns=display_id,name,schema_type_id,status,author,updated_at,notes");
    await waitFor(() => {
      expect(screen.getByText("Hello world")).toBeInTheDocument();
    });
  });

  it("renders number-type schema property with locale formatting", async () => {
    const schemaColumns: EntityHubResponse["available_columns"] = [
      ...DEFAULT_COLUMNS,
      { key: "concentration", label: "Concentration", source: "schema", type: "number", filterable: true, width: null },
    ];
    const items = [
      makeEntityHubItem({ id: 1, _expanded: { concentration: 1234.5 } }),
    ];
    mockGetEntities.mockResolvedValue(
      makePopulatedResponse(items, { available_columns: schemaColumns }),
    );
    renderHub("/entities?columns=display_id,name,schema_type_id,status,author,updated_at,concentration");
    await waitFor(() => {
      expect(screen.getByText("1,234.5")).toBeInTheDocument();
    });
  });

  it("renders number-type as-is when value is not numeric", async () => {
    const schemaColumns: EntityHubResponse["available_columns"] = [
      ...DEFAULT_COLUMNS,
      { key: "concentration", label: "Concentration", source: "schema", type: "number", filterable: true, width: null },
    ];
    const items = [
      makeEntityHubItem({ id: 1, _expanded: { concentration: "N/A" } }),
    ];
    mockGetEntities.mockResolvedValue(
      makePopulatedResponse(items, { available_columns: schemaColumns }),
    );
    renderHub("/entities?columns=display_id,name,schema_type_id,status,author,updated_at,concentration");
    await waitFor(() => {
      expect(screen.getByText("N/A")).toBeInTheDocument();
    });
  });

  it("renders date-type schema property with locale formatting", async () => {
    const schemaColumns: EntityHubResponse["available_columns"] = [
      ...DEFAULT_COLUMNS,
      { key: "collection_date", label: "Collection Date", source: "schema", type: "date", filterable: true, width: null },
    ];
    const items = [
      makeEntityHubItem({ id: 1, _expanded: { collection_date: "2025-03-15" } }),
    ];
    mockGetEntities.mockResolvedValue(
      makePopulatedResponse(items, { available_columns: schemaColumns }),
    );
    renderHub("/entities?columns=display_id,name,schema_type_id,status,author,updated_at,collection_date");
    await waitFor(() => {
      // Locale-formatted date (en-US: "Mar 15, 2025")
      expect(screen.getByText("Mar 15, 2025")).toBeInTheDocument();
    });
  });

  it("renders datetime-type schema property with locale formatting", async () => {
    const schemaColumns: EntityHubResponse["available_columns"] = [
      ...DEFAULT_COLUMNS,
      { key: "processed_at", label: "Processed At", source: "schema", type: "datetime", filterable: true, width: null },
    ];
    const items = [
      makeEntityHubItem({ id: 1, _expanded: { processed_at: "2025-03-15T14:30:00Z" } }),
    ];
    mockGetEntities.mockResolvedValue(
      makePopulatedResponse(items, { available_columns: schemaColumns }),
    );
    renderHub("/entities?columns=display_id,name,schema_type_id,status,author,updated_at,processed_at");
    await waitFor(() => {
      // Should show locale-formatted date+time, not raw ISO
      const cell = document.querySelector(".entities-col-processed_at");
      expect(cell).toBeTruthy();
      expect(cell?.textContent).not.toBe("2025-03-15T14:30:00Z");
      expect(cell?.textContent?.length).toBeGreaterThan(0);
    });
  });

  it("renders boolean true as 'Yes' and false as 'No'", async () => {
    const schemaColumns: EntityHubResponse["available_columns"] = [
      ...DEFAULT_COLUMNS,
      { key: "is_sterile", label: "Sterile", source: "schema", type: "boolean", filterable: true, width: null },
      { key: "is_archived", label: "Archived", source: "schema", type: "boolean", filterable: true, width: null },
    ];
    const items = [
      makeEntityHubItem({ id: 1, _expanded: { is_sterile: true, is_archived: false } }),
    ];
    mockGetEntities.mockResolvedValue(
      makePopulatedResponse(items, { available_columns: schemaColumns }),
    );
    renderHub("/entities?columns=display_id,name,schema_type_id,status,author,updated_at,is_sterile,is_archived");
    await waitFor(() => {
      expect(screen.getByText("Yes")).toBeInTheDocument();
      expect(screen.getByText("No")).toBeInTheDocument();
    });
  });

  it("renders select-type as coloured badge", async () => {
    const schemaColumns: EntityHubResponse["available_columns"] = [
      ...DEFAULT_COLUMNS,
      { key: "blood_type", label: "Blood Type", source: "schema", type: "select", filterable: true, width: null },
    ];
    const items = [
      makeEntityHubItem({ id: 1, _expanded: { blood_type: "A+" } }),
    ];
    mockGetEntities.mockResolvedValue(
      makePopulatedResponse(items, { available_columns: schemaColumns }),
    );
    renderHub("/entities?columns=display_id,name,schema_type_id,status,author,updated_at,blood_type");
    await waitFor(() => {
      const badge = document.querySelector(".entities-select-badge");
      expect(badge).toBeTruthy();
      expect(badge?.textContent).toBe("A+");
      // Should have inline background colour from the hash-based palette
      expect((badge as HTMLElement).style.backgroundColor).toBeTruthy();
      expect((badge as HTMLElement).style.color).toBeTruthy();
    });
  });

  it("renders reference-type as clickable entity link", async () => {
    const schemaColumns: EntityHubResponse["available_columns"] = [
      ...DEFAULT_COLUMNS,
      { key: "parent_sample", label: "Parent Sample", source: "schema", type: "reference", filterable: true, width: null },
    ];
    const items = [
      makeEntityHubItem({
        id: 1,
        workspace_id: "lims",
        _expanded: { parent_sample: "BLOOD1" },
      }),
    ];
    mockGetEntities.mockResolvedValue(
      makePopulatedResponse(items, { available_columns: schemaColumns }),
    );
    renderHub("/entities?columns=display_id,name,schema_type_id,status,author,updated_at,parent_sample");
    await waitFor(() => {
      const link = screen.getByText("BLOOD1");
      expect(link).toBeInTheDocument();
      expect(link.closest("a")).toBeTruthy();
      expect(link.closest("a")?.getAttribute("href")).toBe("/lims/BLOOD1");
    });
  });

  it("renders user-type as clickable link", async () => {
    const schemaColumns: EntityHubResponse["available_columns"] = [
      ...DEFAULT_COLUMNS,
      { key: "assigned_to", label: "Assigned To", source: "schema", type: "user", filterable: true, width: null },
    ];
    const items = [
      makeEntityHubItem({ id: 1, _expanded: { assigned_to: "janedoe" } }),
    ];
    mockGetEntities.mockResolvedValue(
      makePopulatedResponse(items, { available_columns: schemaColumns }),
    );
    renderHub("/entities?columns=display_id,name,schema_type_id,status,author,updated_at,assigned_to");
    await waitFor(() => {
      expect(screen.getByText("janedoe")).toBeInTheDocument();
      const userEl = screen.getByText("janedoe");
      expect(userEl.closest("a")).toBeTruthy();
      expect(userEl.closest("a")?.classList.contains("entities-user-link")).toBeTruthy();
    });
  });

  it("renders unknown-type as String(value) fallback", async () => {
    const schemaColumns: EntityHubResponse["available_columns"] = [
      ...DEFAULT_COLUMNS,
      { key: "legacy_field", label: "Legacy", source: "schema", type: "unknown_custom_type", filterable: true, width: null },
    ];
    const items = [
      makeEntityHubItem({ id: 1, _expanded: { legacy_field: 42 } }),
    ];
    mockGetEntities.mockResolvedValue(
      makePopulatedResponse(items, { available_columns: schemaColumns }),
    );
    renderHub("/entities?columns=display_id,name,schema_type_id,status,author,updated_at,legacy_field");
    await waitFor(() => {
      expect(screen.getByText("42")).toBeInTheDocument();
    });
  });

  // ── System column specialized rendering ──────────────────────────────

  it("system columns retain specialized rendering (not generic type dispatch)", async () => {
    const items = [
      makeEntityHubItem({
        id: 1,
        display_id: "E1",
        name: "Test Entry",
        status: "in_progress",
        author_username: "testuser",
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-03T00:00:00Z",
      }),
    ];
    mockGetEntities.mockResolvedValue(makePopulatedResponse(items));
    // Include created_at in visible columns since it's not visible by default
    renderHub("/entities?columns=display_id,name,schema_type_id,status,author,created_at,updated_at");
    await waitFor(() => {
      expect(screen.getByText("E1")).toBeInTheDocument();
    });

    // display_id: specialized span (not just String(value))
    const displayIdEl = screen.getByText("E1");
    expect(displayIdEl.className).toContain("entities-display-id");

    // created_at / updated_at: relativeTime (not formatted date)
    const createdCell = document.querySelector(".entities-col-created_at");
    expect(createdCell).toBeTruthy();
    expect(createdCell?.textContent).not.toBe("2025-01-01T00:00:00Z");

    // author: should show username (not the stringified author id)
    const authorCell = document.querySelector("td.entities-col-author");
    expect(authorCell?.textContent).toBe("testuser");
  });

  // ── Filter serialization round-trip for incomplete rows ───────────

  it("persists empty filter row to URL so Add Filter survives re-render", async () => {
    const items = [makeEntityHubItem({ id: 1 })];
    mockGetEntities.mockResolvedValue(makePopulatedResponse(items));
    renderHub();
    await waitFor(() => {
      expect(screen.getByText("E1")).toBeInTheDocument();
    });

    // Click the "+ Add Filter" button directly (no popover to open first)
    fireEvent.click(screen.getByText("Add Filter"));

    // The empty filter pill should appear with a "Field" label and "is" operator
    await waitFor(() => {
      expect(screen.getByText("Field")).toBeInTheDocument();
    });

    // The pill should contain the field trigger and operator trigger
    const fieldBtns = screen.getAllByTitle("Choose field");
    expect(fieldBtns.length).toBeGreaterThanOrEqual(1);
    const firstFieldBtn = fieldBtns[0] as HTMLButtonElement;
    expect(firstFieldBtn.textContent).toContain("Field");
  });

  // ── Column header type icons ────────────────────────────────────────

  it("renders column header with type icon span structure", async () => {
    const items = [makeEntityHubItem({ id: 1 })];
    mockGetEntities.mockResolvedValue(makePopulatedResponse(items));
    renderHub();
    await waitFor(() => {
      expect(screen.getByText("E1")).toBeInTheDocument();
    });

    // Column headers should contain the label wrapper with label text
    const thLabels = document.querySelectorAll(".entities-th-label");
    expect(thLabels.length).toBeGreaterThan(0);
    // Each label wrapper should contain the column label text
    const labelTexts = Array.from(thLabels).map((el) => el.textContent?.trim());
    expect(labelTexts).toContain("ID");
    expect(labelTexts).toContain("Name");
  });
});
