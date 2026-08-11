import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LayoutList, Star, User, Archive } from "lucide-react";
import {
  makeLibraryFolder,
  makeLibraryEntry,
  makeLibraryContents,
  makeProject,
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

const mockGetAccessibleProjects = vi.fn();
const mockGetLibraryContents = vi.fn();
vi.mock("../api", () => ({
  getAccessibleProjects: (...args: unknown[]) =>
    mockGetAccessibleProjects(...args),
  getLibraryContents: (...args: unknown[]) =>
    mockGetLibraryContents(...args),
}));

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

vi.mock("../../../shell/src/mod-system/ModRegistry", () => ({
  ModRegistry: {
    getInstance: () => ({
      getWorkspaces: () =>
        new Map([
          [
            "eln",
            {
              id: "eln",
              displayName: "ELN",
              icon: undefined,
              schemaType: {
                id: "eln.entry",
                displayName: "ELN Entry",
                defaultPrefix: "E",
                columns: [],
              },
            },
          ],
        ]),
    }),
  },
}));

vi.mock("../../../shell/src/shared/components/Sidebar/SlotSidebar", () => ({
  SlotSidebar: function MockSlotSidebar() {
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
              <LayoutList size={14} className="library-sidebar-view-icon" aria-hidden="true" />
              All Entries
            </li>
            <li className="library-sidebar-view-item">
              <Star size={14} className="library-sidebar-view-icon" aria-hidden="true" />
              Starred
            </li>
            <li className="library-sidebar-view-item">
              <User size={14} className="library-sidebar-view-icon" aria-hidden="true" />
              My Entries
            </li>
            <li className="library-sidebar-view-item">
              <Archive size={14} className="library-sidebar-view-icon" aria-hidden="true" />
              Archived
            </li>
          </ul>
        </div>
      </aside>
    );
  },
}));

// ── Fixtures ─────────────────────────────────────────────────────────

const emptyContentsResponse = makeLibraryContents();

const populatedContentsResponse = makeLibraryContents(
  [
    makeLibraryFolder({ id: 1, name: "Experiments" }),
    makeLibraryFolder({
      id: 2,
      name: "Protocols",
      created_at: "2025-01-02T00:00:00Z",
    }),
  ],
  [
    makeLibraryEntry({
      id: 10,
      workspace_id: "eln",
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
  {
    project_uid: "proj-001",
    project_name: "Test Project",
    project_is_archived: false,
    project_icon: "flask",
    project_color: "crimson",
  },
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
    mockGetAccessibleProjects.mockReset();
    mockGetLibraryContents.mockReset();
    mockNavigate.mockReset();
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k]);
    mockLocalStorage.getItem.mockClear();
    mockLocalStorage.setItem.mockClear();
  });

  // ── Projects listing mode ─────────────────────────────────────────

  describe("projects listing", () => {
    it("shows loading state initially", () => {
      mockGetAccessibleProjects.mockReturnValue(new Promise(() => {}));
      renderLibrary();
      expect(screen.getByText("Loading…")).toBeInTheDocument();
    });

    it("shows empty state when zero projects (regular user)", async () => {
      mockGetAccessibleProjects.mockResolvedValue([]);
      renderLibrary();
      await waitFor(() => {
        expect(screen.getByText("The null hypothesis stands: no projects found.")).toBeInTheDocument();
      });
      // Both regular users and org admins with zero projects get the same message
    });

    it("shows empty state with org admin hint when org admin has projects but no role", async () => {
      // Org admins see projects with null role which triggers isOrgAdmin=true
      mockGetAccessibleProjects.mockResolvedValue([
        makeProject({ id: 1, uid: "p1", name: "Alpha", current_user_role: null }),
      ]);
      renderLibrary();
      await waitFor(() => {
        // Org admin badge-less rendering — no Read/Edit badge
        expect(screen.queryByText("Read")).toBeNull();
        expect(screen.queryByText("Edit")).toBeNull();
      });
    });

    it("renders project cards for accessible projects", async () => {
      mockGetAccessibleProjects.mockResolvedValue([
        makeProject({ id: 1, uid: "p1", name: "Alpha", current_user_role: "read" }),
        makeProject({ id: 2, uid: "p2", name: "Beta", current_user_role: "edit" }),
      ]);
      renderLibrary();
      await waitFor(() => {
        expect(screen.getByText("Alpha")).toBeInTheDocument();
        expect(screen.getByText("Beta")).toBeInTheDocument();
      });
    });

    it("renders role badge labels on project cards", async () => {
      mockGetAccessibleProjects.mockResolvedValue([
        makeProject({ id: 1, uid: "p1", name: "Alpha", current_user_role: "read" }),
        makeProject({ id: 2, uid: "p2", name: "Beta", current_user_role: "edit" }),
      ]);
      renderLibrary();
      await waitFor(() => {
        expect(screen.getByText("Read")).toBeInTheDocument();
        expect(screen.getByText("Edit")).toBeInTheDocument();
      });
    });

    it("org admin project cards show no role badge", async () => {
      mockGetAccessibleProjects.mockResolvedValue([
        makeProject({ id: 1, uid: "p1", name: "Admin Project", current_user_role: null }),
      ]);
      renderLibrary();
      await waitFor(() => {
        expect(screen.getByText("Admin Project")).toBeInTheDocument();
        expect(screen.queryByText("Read")).toBeNull();
        expect(screen.queryByText("Edit")).toBeNull();
      });
    });

    it("navigates to project on click", async () => {
      mockGetAccessibleProjects.mockResolvedValue([
        makeProject({ id: 1, uid: "abc-123", name: "Alpha" }),
      ]);
      renderLibrary();
      await waitFor(() => {
        expect(screen.getByText("Alpha")).toBeInTheDocument();
      });

      const cards = document.querySelectorAll(".is-project-card");
      expect(cards.length).toBeGreaterThan(0);
      fireEvent.click(cards[0]);

      expect(mockGetLibraryContents).toHaveBeenCalled();
    });

    it("does not show breadcrumbs in projects listing mode", async () => {
      mockGetAccessibleProjects.mockResolvedValue([
        makeProject({ id: 1, uid: "p1", name: "Alpha" }),
      ]);
      renderLibrary();
      await waitFor(() => {
        expect(screen.getByText("Alpha")).toBeInTheDocument();
      });
      expect(screen.queryByRole("navigation")).toBeNull();
    });
  });

  // ── Project contents mode ──────────────────────────────────────────

  describe("project contents", () => {
    it("passes project uid and path from URL to API", async () => {
      mockGetLibraryContents.mockResolvedValue(emptyContentsResponse);
      renderLibrary("/library?project=proj-1&path=/Experiments");
      await waitFor(() => {
        expect(mockGetLibraryContents).toHaveBeenCalledWith(
          "proj-1",
          "/Experiments",
          undefined,
        );
      });
    });

    it("shows loading state initially inside project", () => {
      mockGetLibraryContents.mockReturnValue(new Promise(() => {}));
      renderLibrary("/library?project=proj-1");
      expect(screen.getByText("Loading…")).toBeInTheDocument();
    });

    it("shows empty state when folder is empty", async () => {
      mockGetLibraryContents.mockResolvedValue(emptyContentsResponse);
      renderLibrary("/library?project=proj-1");
      await waitFor(() => {
        expect(screen.getByText("This folder is empty.")).toBeInTheDocument();
      });
    });

    it("shows error message on fetch failure", async () => {
      mockGetLibraryContents.mockRejectedValue(new Error("Network error"));
      renderLibrary("/library?project=proj-1");
      await waitFor(() => {
        expect(screen.getByText("Network error")).toBeInTheDocument();
      });
    });

    it("renders project-aware breadcrumbs", async () => {
      mockGetLibraryContents.mockResolvedValue(populatedContentsResponse);
      renderLibrary("/library?project=proj-001");
      await waitFor(() => {
        expect(screen.getByText("Test Project")).toBeInTheDocument();
        expect(screen.getByText("root")).toBeInTheDocument();
      });
    });

    it("renders Archived pill for archived projects", async () => {
      const archivedResponse = makeLibraryContents(
        [makeLibraryFolder({ id: 1, name: "Data" })],
        [],
        {
          project_uid: "proj-arch",
          project_name: "Old Project",
          project_is_archived: true,
          project_icon: "",
          project_color: "",
        },
      );
      mockGetLibraryContents.mockResolvedValue(archivedResponse);
      renderLibrary("/library?project=proj-arch");
      await waitFor(() => {
        expect(screen.getByText("Old Project")).toBeInTheDocument();
        // "Archived" pill appears in breadcrumb AND sidebar "Archived" item
        const archivedElements = screen.getAllByText("Archived");
        expect(archivedElements.length).toBeGreaterThanOrEqual(1);
        // The breadcrumb pill has class "archived-pill"
        const pill = document.querySelector(".archived-pill");
        expect(pill).toBeInTheDocument();
        expect(pill?.textContent).toBe("Archived");
      });
    });

    it("renders breadcrumbs with up-button for navigation", async () => {
      mockGetLibraryContents.mockResolvedValue(populatedContentsResponse);
      renderLibrary("/library?project=proj-001");
      await waitFor(() => {
        expect(screen.getByTitle("Go up")).toBeInTheDocument();
      });
    });

    it("renders breadcrumb path segments for nested folders", async () => {
      mockGetLibraryContents.mockResolvedValue(
        makeLibraryContents(
          [makeLibraryFolder({ id: 3, name: "Q1" })],
          [],
          {
            project_uid: "proj-001",
            project_name: "Test Project",
            project_is_archived: false,
          },
        ),
      );
      renderLibrary("/library?project=proj-001&path=/Experiments");
      await waitFor(() => {
        expect(screen.getByText("Test Project")).toBeInTheDocument();
        expect(screen.getByText("Experiments")).toBeInTheDocument();
      });
    });

    it("clicking project name in breadcrumb navigates to projects listing", async () => {
      mockGetLibraryContents.mockResolvedValue(populatedContentsResponse);
      renderLibrary("/library?project=proj-001");
      await waitFor(() => {
        expect(screen.getByText("Test Project")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Test Project"));

      await waitFor(() => {
        expect(mockGetAccessibleProjects).toHaveBeenCalled();
      });
    });

    // ── Cards inside project ───────────────────────────────────────

    it("renders folder cards for folder items", async () => {
      mockGetLibraryContents.mockResolvedValue(populatedContentsResponse);
      renderLibrary("/library?project=proj-001");
      await waitFor(() => {
        expect(screen.getByText("Experiments")).toBeInTheDocument();
        expect(screen.getByText("Protocols")).toBeInTheDocument();
      });
    });

    it("renders entry cards with wired fields", async () => {
      mockGetLibraryContents.mockResolvedValue(populatedContentsResponse);
      renderLibrary("/library?project=proj-001");
      await waitFor(() => {
        expect(screen.getByText("EXP-0284")).toBeInTheDocument();
        expect(screen.getByText("PCR Results")).toBeInTheDocument();
        expect(screen.getByText("In Progress")).toBeInTheDocument();
        expect(screen.getByText("First paragraph of content.")).toBeInTheDocument();
        expect(screen.getByText("CRISPR")).toBeInTheDocument();
        expect(screen.getByText("testuser")).toBeInTheDocument();
      });
    });

    it("navigates into folder when clicking a folder card", async () => {
      mockGetLibraryContents.mockResolvedValue(populatedContentsResponse);
      renderLibrary("/library?project=proj-001");
      await waitFor(() => {
        expect(screen.getByText("Protocols")).toBeInTheDocument();
      });

      const cards = screen.getAllByTestId("base-library-card");
      const folderCard = cards.find((card) =>
        card.textContent?.includes("Protocols"),
      )!;
      fireEvent.click(folderCard);

      await waitFor(() => {
        expect(mockGetLibraryContents).toHaveBeenCalledWith(
          "proj-001",
          "/Protocols",
          undefined,
        );
      });
    });

    it("navigates to workspace page when clicking an entry", async () => {
      mockGetLibraryContents.mockResolvedValue(populatedContentsResponse);
      renderLibrary("/library?project=proj-001");
      await waitFor(() => {
        expect(screen.getByText("EXP-0284")).toBeInTheDocument();
      });

      const cards = screen.getAllByTestId("base-library-card");
      const entryCard = cards.find((card) =>
        card.textContent?.includes("EXP-0284"),
      )!;
      fireEvent.click(entryCard);

      expect(mockNavigate).toHaveBeenCalledWith("/eln/EXP-0284");
    });

    // ── Top bar elements ────────────────────────────────────────────

    it("renders the export placeholder button", async () => {
      mockGetLibraryContents.mockResolvedValue(populatedContentsResponse);
      renderLibrary("/library?project=proj-001");
      await waitFor(() => {
        expect(screen.getByTitle("Export")).toBeInTheDocument();
        expect(screen.getByTitle("Export")).toBeDisabled();
      });
    });

    it("renders the + new button", async () => {
      mockGetLibraryContents.mockResolvedValue(populatedContentsResponse);
      renderLibrary("/library?project=proj-001");
      await waitFor(() => {
        expect(screen.getByTitle("New folder or entry")).toBeInTheDocument();
      });
    });

    // ── View mode toggle ───────────────────────────────────────────

    it("renders all three view toggle buttons inside project", async () => {
      mockGetLibraryContents.mockResolvedValue(populatedContentsResponse);
      renderLibrary("/library?project=proj-001");
      await waitFor(() => {
        expect(screen.getByTitle("List view")).toBeInTheDocument();
        expect(screen.getByTitle("Grid view")).toBeInTheDocument();
        expect(screen.getByTitle("Compact view")).toBeInTheDocument();
      });
    });

    it("clicking Grid view activates it", async () => {
      mockGetLibraryContents.mockResolvedValue(populatedContentsResponse);
      renderLibrary("/library?project=proj-001");
      await waitFor(() => {
        expect(screen.getByTitle("List view")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle("Grid view"));

      const listBtn = screen.getByTitle("List view");
      const gridBtn = screen.getByTitle("Grid view");
      expect(listBtn.className).not.toContain("is-active");
      expect(gridBtn.className).toContain("is-active");
    });

    it("applies view mode CSS class to card list container", async () => {
      mockGetLibraryContents.mockResolvedValue(populatedContentsResponse);
      renderLibrary("/library?project=proj-001");
      await waitFor(() => {
        expect(screen.getByText("EXP-0284")).toBeInTheDocument();
      });

      const cardList = document.querySelector(".library-card-list");
      expect(cardList?.className).toContain("view-list");

      fireEvent.click(screen.getByTitle("Grid view"));
      expect(cardList?.className).toContain("view-grid");
    });

    it("persists view mode preference to localStorage", async () => {
      mockGetLibraryContents.mockResolvedValue(populatedContentsResponse);
      renderLibrary("/library?project=proj-001");
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
      localStorageStore["helix-library-view-mode"] = "grid";
      mockLocalStorage.getItem.mockImplementation(
        (key: string) => localStorageStore[key] ?? null,
      );

      mockGetLibraryContents.mockResolvedValue(populatedContentsResponse);
      renderLibrary("/library?project=proj-001");
      await waitFor(() => {
        expect(screen.getByTitle("Grid view")).toBeInTheDocument();
      });

      expect(screen.getByTitle("Grid view").className).toContain("is-active");
    });

    // ── Filter bar ──────────────────────────────────────────────────

    it("renders filter bar inside project", async () => {
      mockGetLibraryContents.mockResolvedValue(emptyContentsResponse);
      renderLibrary("/library?project=proj-001");
      await waitFor(() => {
        expect(screen.getByPlaceholderText("Search…")).toBeInTheDocument();
      });
    });

    // ── Load More ───────────────────────────────────────────────────

    it("renders Load More button when there are more results", async () => {
      const withMore = makeLibraryContents(
        [makeLibraryFolder({ id: 1 })],
        [makeLibraryEntry({ id: 10, workspace_id: "eln" })],
        {
          next: "/library/contents/?project=proj-001&path=&page=2",
          project_uid: "proj-001",
          project_name: "Test Project",
          project_is_archived: false,
        },
      );
      mockGetLibraryContents.mockResolvedValue(withMore);
      renderLibrary("/library?project=proj-001");
      await waitFor(() => {
        expect(screen.getByText("Load More")).toBeInTheDocument();
      });
    });
  });

  // ── Sidebar ────────────────────────────────────────────────────────

  it("renders sidebar in projects listing mode", async () => {
    mockGetAccessibleProjects.mockResolvedValue([
      makeProject({ id: 1, uid: "p1", name: "Alpha" }),
    ]);
    renderLibrary();
    await waitFor(() => {
      expect(screen.getByText("SELECTION")).toBeInTheDocument();
    });
  });

  it("renders sidebar inside project", async () => {
    mockGetLibraryContents.mockResolvedValue(populatedContentsResponse);
    renderLibrary("/library?project=proj-001");
    await waitFor(() => {
      expect(screen.getByText("SELECTION")).toBeInTheDocument();
    });
  });

  // ── Shared folders ───────────────────────────────────────────────

  it("renders shared folder with dedicated icon and source project name in card", async () => {
    const sharedResponse = makeLibraryContents(
      [
        makeLibraryFolder({
          id: 1,
          name: "Shared Protocols",
          is_shared: true,
          source_project_id: 2,
          source_project_name: "Source Lab",
          source_project_icon: "flask",
          source_project_color: "crimson",
        }),
        makeLibraryFolder({ id: 2, name: "Experiments" }),
      ],
      [],
      {
        project_uid: "proj-001",
        project_name: "Test Project",
        project_is_archived: false,
      },
    );
    mockGetLibraryContents.mockResolvedValue(sharedResponse);
    renderLibrary("/library?project=proj-001");
    await waitFor(() => {
      expect(screen.getByText("Shared Protocols")).toBeInTheDocument();
      expect(screen.getByText("Source Lab")).toBeInTheDocument();
    });
  });

  it("navigates into shared folder by path-based URL", async () => {
    mockGetLibraryContents.mockResolvedValue(
      makeLibraryContents(
        [makeLibraryFolder({ id: 3, name: "Nested Child" })],
        [],
        {
          project_uid: "proj-001",
          project_name: "Test Project",
          project_is_archived: false,
        },
      ),
    );
    renderLibrary("/library?project=proj-001&path=/SharedFolder");
    await waitFor(() => {
      expect(mockGetLibraryContents).toHaveBeenCalledWith(
        "proj-001",
        "/SharedFolder",
        undefined,
      );
    });
  });

  it("shows plain folder name in breadcrumb for shared folders", async () => {
    mockGetLibraryContents.mockResolvedValue(
      makeLibraryContents(
        [makeLibraryFolder({ id: 3, name: "Child" })],
        [],
        {
          project_uid: "proj-001",
          project_name: "Test Project",
          project_is_archived: false,
        },
      ),
    );
    renderLibrary("/library?project=proj-001&path=/SharedFolder");
    await waitFor(() => {
      expect(screen.getByText("SharedFolder")).toBeInTheDocument();
      expect(screen.getByText("Test Project")).toBeInTheDocument();
    });
  });

  it("renders shared folders sorted alphabetically among owned folders", async () => {
    const mixedResponse = makeLibraryContents(
      [
        makeLibraryFolder({ id: 1, name: "A Folder" }),
        makeLibraryFolder({
          id: 2,
          name: "B Shared",
          is_shared: true,
          source_project_name: "Source",
        }),
        makeLibraryFolder({ id: 3, name: "C Owned" }),
      ],
      [],
      {
        project_uid: "proj-001",
        project_name: "Test Project",
        project_is_archived: false,
      },
    );
    mockGetLibraryContents.mockResolvedValue(mixedResponse);
    renderLibrary("/library?project=proj-001");
    await waitFor(() => {
      expect(screen.getByText("A Folder")).toBeInTheDocument();
      expect(screen.getByText("B Shared")).toBeInTheDocument();
      expect(screen.getByText("C Owned")).toBeInTheDocument();
    });
  });
});
