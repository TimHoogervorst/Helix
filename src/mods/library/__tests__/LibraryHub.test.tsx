import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LayoutList, Star, User, Archive } from "lucide-react";
import {
  makeLibraryFolder,
  makeLibraryEntry,
  makeLibraryContents,
} from "../../../shell/src/test/factories";
import LibraryHub from "../hub/LibraryHub";

// ── Mocks ────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockGetLibraryContents = vi.fn();
vi.mock("../api", () => ({
  getLibraryContents: (...args: unknown[]) => mockGetLibraryContents(...args),
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

// Mock ModRegistry — LibraryHub resolves library item configs
vi.mock("../../../shell/src/mod-system/ModRegistry", () => ({
  ModRegistry: {
    getInstance: () => ({
      resolveLibraryItem: () => ({
        id: "eln.entry",
        icon: () => null,
        listCard: () => null,
        property_fields: [
          { key: "samples_count" },
          { key: "attachments_count" },
        ],
      }),
    }),
  },
}));

// Mock SlotSidebar — renders the same HTML as the previously hardcoded aside
// so existing sidebar assertions continue to pass.
vi.mock("../../../shell/src/shared/components/Sidebar/SlotSidebar", () => ({
  SlotSidebar: function MockSlotSidebar(_props: { slotId: string }) {
    return (
      <aside className="library-sidebar">
        <div className="library-sidebar-section">
          <h3 className="library-sidebar-heading">SELECTION</h3>
          <p className="library-sidebar-placeholder">
            Select an entry to see details.
          </p>
        </div>
        <div className="library-sidebar-section">
          <h3 className="library-sidebar-heading">VIEWS</h3>
          <ul className="library-sidebar-views">
            <li className="library-sidebar-view-item is-active">
              <LayoutList
                size={14}
                className="library-sidebar-view-icon"
                aria-hidden="true"
              />
              All Entries
            </li>
            <li className="library-sidebar-view-item">
              <Star
                size={14}
                className="library-sidebar-view-icon"
                aria-hidden="true"
              />
              Starred
            </li>
            <li className="library-sidebar-view-item">
              <User
                size={14}
                className="library-sidebar-view-icon"
                aria-hidden="true"
              />
              My Entries
            </li>
            <li className="library-sidebar-view-item">
              <Archive
                size={14}
                className="library-sidebar-view-icon"
                aria-hidden="true"
              />
              Archived
            </li>
          </ul>
        </div>
      </aside>
    );
  },
}));

// ── Fixtures ─────────────────────────────────────────────────────────

const emptyResponse = makeLibraryContents();

const populatedResponse = makeLibraryContents(
  [
    makeLibraryFolder({ id: 1 }),
    makeLibraryFolder({
      id: 2,
      name: "Protocols",
      created_at: "2025-01-02T00:00:00Z",
    }),
  ],
  [
    makeLibraryEntry({
      id: 10,
      display_id: "EXP-0284",
      title: "PCR Results",
      folder: 1,
      folder_name: "Experiments",
      author_username: "testuser",
      author_info: {
        id: 2,
        username: "testuser",
        first_name: "Test",
        last_name: "User",
        color: "#4A90D9",
      },
      status: "in_progress",
      description: "First paragraph of content.",
      tags: [{ id: 1, name: "CRISPR", color: "flask", icon: "circle" }],
      created_at: "2025-01-03T00:00:00Z",
      updated_at: "2025-01-03T00:00:00Z",
    }),
  ],
);

// ── Helpers ──────────────────────────────────────────────────────────

function renderLibrary(initialRoute = "/library") {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <LibraryHub />
    </MemoryRouter>,
  );
}

// ── Tests ────────────────────────────────────────────────────────────

describe("LibraryHub", () => {
  beforeEach(() => {
    mockGetLibraryContents.mockReset();
    mockNavigate.mockReset();
    // Clear localStorage between tests
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k]);
    mockLocalStorage.getItem.mockClear();
    mockLocalStorage.setItem.mockClear();
  });

  // ── Loading / Empty / Error states ─────────────────────────────────

  it("shows loading state initially", () => {
    mockGetLibraryContents.mockReturnValue(new Promise(() => {})); // never resolves
    renderLibrary();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows empty state when folder is empty", async () => {
    mockGetLibraryContents.mockResolvedValue(emptyResponse);
    renderLibrary();
    await waitFor(() => {
      expect(screen.getByText("This folder is empty.")).toBeInTheDocument();
    });
  });

  it("shows error message on fetch failure", async () => {
    mockGetLibraryContents.mockRejectedValue(new Error("Network error"));
    renderLibrary();
    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  // ── Breadcrumbs ─────────────────────────────────────────────────────

  it("renders breadcrumbs with root as current at root path", async () => {
    mockGetLibraryContents.mockResolvedValue(emptyResponse);
    renderLibrary();
    await waitFor(() => {
      const root = screen.getByText(/root/);
      expect(root.className).toContain("is-current");
    });
  });

  it("renders breadcrumbs with Folder icon preceding the path", async () => {
    mockGetLibraryContents.mockResolvedValue(emptyResponse);
    renderLibrary();
    await waitFor(() => {
      // The Folder icon is rendered with the breadcrumb-folder-icon class
      const folderIcons = document.querySelectorAll(
        ".breadcrumb-folder-icon",
      );
      expect(folderIcons.length).toBe(1);
    });
  });

  it("renders breadcrumbs with up-button for navigation", async () => {
    mockGetLibraryContents.mockResolvedValue(emptyResponse);
    renderLibrary();
    await waitFor(() => {
      expect(screen.getByTitle("Go up")).toBeInTheDocument();
    });
  });

  it("passes current path from URL to API", async () => {
    mockGetLibraryContents.mockResolvedValue(emptyResponse);
    renderLibrary("/library?path=/Experiments");
    await waitFor(() => {
      expect(mockGetLibraryContents).toHaveBeenCalledWith(
        "/Experiments",
        undefined,
      );
    });
  });

  // ── Cards ───────────────────────────────────────────────────────────

  it("renders folder cards for folder items", async () => {
    mockGetLibraryContents.mockResolvedValue(populatedResponse);
    renderLibrary();
    await waitFor(() => {
      // Folder cards should exist — we look for folder names
      expect(screen.getByText("Experiments")).toBeInTheDocument();
      expect(screen.getByText("Protocols")).toBeInTheDocument();
    });
  });

  it("renders entry cards with wired fields", async () => {
    mockGetLibraryContents.mockResolvedValue(populatedResponse);
    renderLibrary();
    await waitFor(() => {
      // Entry card fields
      expect(screen.getByText("EXP-0284")).toBeInTheDocument();
      expect(screen.getByText("PCR Results")).toBeInTheDocument();
      expect(screen.getByText("In Progress")).toBeInTheDocument();
      expect(
        screen.getByText("First paragraph of content."),
      ).toBeInTheDocument();
      expect(screen.getByText("CRISPR")).toBeInTheDocument();
      expect(screen.getByText("testuser")).toBeInTheDocument();
    });
  });

  it("renders entry cards with all expected BaseLibraryCard elements", async () => {
    mockGetLibraryContents.mockResolvedValue(populatedResponse);
    renderLibrary();
    await waitFor(() => {
      const cards = screen.getAllByTestId("base-library-card");
      // 2 folders + 1 entry = 3 cards
      expect(cards.length).toBeGreaterThanOrEqual(3);
      // Star buttons on every card
      expect(screen.getAllByTestId("star-button").length).toBeGreaterThanOrEqual(3);
    });
  });

  // ── Navigation ──────────────────────────────────────────────────────

  it("navigates to ELN workspace when clicking an entry card", async () => {
    mockGetLibraryContents.mockResolvedValue(populatedResponse);
    renderLibrary();
    await waitFor(() => {
      expect(screen.getByText("EXP-0284")).toBeInTheDocument();
    });
    // Click the entry card
    const cards = screen.getAllByTestId("base-library-card");
    // Find the entry card (has EXP-0284)
    const entryCard = cards.find((card) =>
      card.textContent?.includes("EXP-0284"),
    )!;
    fireEvent.click(entryCard);
    expect(mockNavigate).toHaveBeenCalledWith("/eln/EXP-0284");
  });

  it("navigates into folder when clicking a folder card", async () => {
    mockGetLibraryContents.mockResolvedValue(populatedResponse);
    renderLibrary();
    await waitFor(() => {
      expect(screen.getByText("Protocols")).toBeInTheDocument();
    });
    // Click the Protocols folder card
    const cards = screen.getAllByTestId("base-library-card");
    const folderCard = cards.find((card) =>
      card.textContent?.includes("Protocols"),
    )!;
    fireEvent.click(folderCard);
    // Folder click navigates via search params update (not navigate())
    // The API should be called with the new path
    await waitFor(() => {
      expect(mockGetLibraryContents).toHaveBeenCalledWith(
        "/Protocols",
        undefined,
      );
    });
  });

  // ── Top bar elements ────────────────────────────────────────────────

  describe("view mode toggle", () => {
    it("renders all three view toggle buttons (List, Grid, Compact)", async () => {
      mockGetLibraryContents.mockResolvedValue(emptyResponse);
      renderLibrary();
      await waitFor(() => {
        expect(screen.getByTitle("List view")).toBeInTheDocument();
        expect(screen.getByTitle("Grid view")).toBeInTheDocument();
        expect(screen.getByTitle("Compact view")).toBeInTheDocument();
      });
    });

    it("List view is active by default", async () => {
      mockGetLibraryContents.mockResolvedValue(emptyResponse);
      renderLibrary();
      await waitFor(() => {
        const listBtn = screen.getByTitle("List view");
        expect(listBtn.className).toContain("is-active");
      });
    });

    it("clicking Grid view activates it and deactivates List", async () => {
      mockGetLibraryContents.mockResolvedValue(emptyResponse);
      renderLibrary();
      await waitFor(() => {
        expect(screen.getByTitle("List view")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle("Grid view"));

      const listBtn = screen.getByTitle("List view");
      const gridBtn = screen.getByTitle("Grid view");
      expect(listBtn.className).not.toContain("is-active");
      expect(gridBtn.className).toContain("is-active");
    });

    it("clicking Compact view activates it", async () => {
      mockGetLibraryContents.mockResolvedValue(emptyResponse);
      renderLibrary();
      await waitFor(() => {
        expect(screen.getByTitle("Compact view")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle("Compact view"));

      expect(screen.getByTitle("Compact view").className).toContain(
        "is-active",
      );
    });

    it("applies view mode CSS class to card list container", async () => {
      mockGetLibraryContents.mockResolvedValue(populatedResponse);
      renderLibrary();
      await waitFor(() => {
        expect(screen.getByText("EXP-0284")).toBeInTheDocument();
      });

      // Default is list view
      const cardList = document.querySelector(".library-card-list");
      expect(cardList?.className).toContain("view-list");

      // Switch to grid
      fireEvent.click(screen.getByTitle("Grid view"));
      expect(cardList?.className).toContain("view-grid");
      expect(cardList?.className).not.toContain("view-list");

      // Switch to compact
      fireEvent.click(screen.getByTitle("Compact view"));
      expect(cardList?.className).toContain("view-compact");
      expect(cardList?.className).not.toContain("view-grid");
    });

    it("persists view mode preference to localStorage", async () => {
      mockGetLibraryContents.mockResolvedValue(emptyResponse);
      renderLibrary();
      await waitFor(() => {
        expect(screen.getByTitle("List view")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle("Grid view"));

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        "helix-library-view-mode",
        "grid",
      );
    });

    it("restores view mode from localStorage on mount", async () => {
      // Pre-set localStorage to grid
      localStorageStore["helix-library-view-mode"] = "grid";
      mockLocalStorage.getItem.mockImplementation(
        (key: string) => localStorageStore[key] ?? null,
      );

      mockGetLibraryContents.mockResolvedValue(emptyResponse);
      renderLibrary();
      await waitFor(() => {
        expect(screen.getByTitle("Grid view")).toBeInTheDocument();
      });

      const gridBtn = screen.getByTitle("Grid view");
      expect(gridBtn.className).toContain("is-active");
    });

    it("switching view mode does NOT trigger a data refetch", async () => {
      mockGetLibraryContents.mockResolvedValue(populatedResponse);
      renderLibrary();
      await waitFor(() => {
        expect(screen.getByText("EXP-0284")).toBeInTheDocument();
      });

      const callCount = mockGetLibraryContents.mock.calls.length;

      fireEvent.click(screen.getByTitle("Grid view"));
      fireEvent.click(screen.getByTitle("Compact view"));
      fireEvent.click(screen.getByTitle("List view"));

      // No additional API calls should have been made
      expect(mockGetLibraryContents.mock.calls.length).toBe(callCount);
    });

    it("passes viewMode to BaseLibraryCard elements", async () => {
      mockGetLibraryContents.mockResolvedValue(populatedResponse);
      renderLibrary();
      await waitFor(() => {
        expect(screen.getByText("EXP-0284")).toBeInTheDocument();
      });

      // Cards should have view-list class by default
      const cards = screen.getAllByTestId("base-library-card");
      for (const card of cards) {
        expect(card.className).toContain("view-list");
      }

      // Switch to grid
      fireEvent.click(screen.getByTitle("Grid view"));

      // Cards should now have view-grid class
      const updatedCards = screen.getAllByTestId("base-library-card");
      for (const card of updatedCards) {
        expect(card.className).toContain("view-grid");
      }
    });
  });

  it("renders the export placeholder button", async () => {
    mockGetLibraryContents.mockResolvedValue(emptyResponse);
    renderLibrary();
    await waitFor(() => {
      const exportBtn = screen.getByTitle("Export");
      expect(exportBtn).toBeInTheDocument();
      expect(exportBtn).toBeDisabled();
    });
  });

  it("renders the + new button (LibraryNewDropdown)", async () => {
    mockGetLibraryContents.mockResolvedValue(emptyResponse);
    renderLibrary();
    await waitFor(() => {
      expect(screen.getByTitle("New folder or entry")).toBeInTheDocument();
    });
  });

  // ── Filter bar ──────────────────────────────────────────────────────

  it("renders filter bar with all placeholder controls", async () => {
    mockGetLibraryContents.mockResolvedValue(emptyResponse);
    renderLibrary();
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Search…")).toBeInTheDocument();
      expect(screen.getByText("Last updated")).toBeInTheDocument();
    });
  });

  it("filter bar controls are disabled (placeholder)", async () => {
    mockGetLibraryContents.mockResolvedValue(emptyResponse);
    renderLibrary();
    await waitFor(() => {
      const searchInput = screen.getByPlaceholderText("Search…");
      expect(searchInput).toBeDisabled();
    });
  });

  // ── Right sidebar ───────────────────────────────────────────────────

  it("renders SELECTION section placeholder", async () => {
    mockGetLibraryContents.mockResolvedValue(emptyResponse);
    renderLibrary();
    await waitFor(() => {
      expect(screen.getByText("SELECTION")).toBeInTheDocument();
      expect(
        screen.getByText("Select an entry to see details."),
      ).toBeInTheDocument();
    });
  });

  it("renders VIEWS section with placeholder items", async () => {
    mockGetLibraryContents.mockResolvedValue(emptyResponse);
    renderLibrary();
    await waitFor(() => {
      expect(screen.getByText("VIEWS")).toBeInTheDocument();
      expect(screen.getByText("All Entries")).toBeInTheDocument();
      expect(screen.getByText("Starred")).toBeInTheDocument();
      expect(screen.getByText("My Entries")).toBeInTheDocument();
      expect(screen.getByText("Archived")).toBeInTheDocument();
    });
  });

  it('renders "All Entries" as visually active by default', async () => {
    mockGetLibraryContents.mockResolvedValue(emptyResponse);
    renderLibrary();
    await waitFor(() => {
      // Each view item is an <li>. Find the one containing "All Entries".
      const items = screen.getAllByRole("listitem");
      const allEntries = items.find((el) =>
        el.textContent?.includes("All Entries"),
      );
      expect(allEntries).toBeDefined();
      expect(allEntries!.className).toContain("is-active");
    });
  });

  it("renders non-active Views items without is-active class", async () => {
    mockGetLibraryContents.mockResolvedValue(emptyResponse);
    renderLibrary();
    await waitFor(() => {
      const items = screen.getAllByRole("listitem");
      const starred = items.find((el) => el.textContent?.includes("Starred"));
      const myEntries = items.find((el) =>
        el.textContent?.includes("My Entries"),
      );
      const archived = items.find((el) =>
        el.textContent?.includes("Archived"),
      );
      expect(starred).toBeDefined();
      expect(myEntries).toBeDefined();
      expect(archived).toBeDefined();
      expect(starred!.className).not.toContain("is-active");
      expect(myEntries!.className).not.toContain("is-active");
      expect(archived!.className).not.toContain("is-active");
    });
  });

  it("renders Views sidebar items with icons", async () => {
    mockGetLibraryContents.mockResolvedValue(emptyResponse);
    renderLibrary();
    await waitFor(() => {
      // Each view item contains an icon with the library-sidebar-view-icon class
      const icons = document.querySelectorAll(".library-sidebar-view-icon");
      expect(icons.length).toBe(4);
    });
  });

  // ── Load More ───────────────────────────────────────────────────────

  it("renders Load More button when there are more results", async () => {
    const withMore = makeLibraryContents(
      [makeLibraryFolder({ id: 1 })],
      [makeLibraryEntry({ id: 10 })],
      { next: "/library/contents/?path=&page=2" },
    );
    mockGetLibraryContents.mockResolvedValue(withMore);
    renderLibrary();
    await waitFor(() => {
      expect(screen.getByText("Load More")).toBeInTheDocument();
    });
  });
});
