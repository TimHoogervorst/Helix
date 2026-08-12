import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LayoutList, Star, User, Archive } from "lucide-react";
import {
  makeLibraryFolder,
  makeLibraryEntry,
  makeLibraryContents,
  makeProject,
  makeFolderShare,
} from "../../../shell/src/test/factories";
import LibraryHub from "../hub/LibraryHub";
import RowMenu from "../hub/RowMenu";

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
const mockGetFolders = vi.fn().mockResolvedValue([]);
const mockDeleteFolder = vi.fn();
const mockDeleteEntry = vi.fn();
vi.mock("../api", () => ({
  getAccessibleProjects: (...args: unknown[]) =>
    mockGetAccessibleProjects(...args),
  getLibraryContents: (...args: unknown[]) =>
    mockGetLibraryContents(...args),
  getFolders: (...args: unknown[]) =>
    mockGetFolders(...args),
  patchFolder: (...args: unknown[]) =>
    mockPatchFolder(...args),
  deleteFolder: (...args: unknown[]) =>
    mockDeleteFolder(...args),
  deleteEntry: (...args: unknown[]) =>
    mockDeleteEntry(...args),
}));

const mockFetchOutgoingShares = vi.fn();
const mockCreateFolderShare = vi.fn();
const mockPatchFolderShareLevel = vi.fn();
const mockDeleteFolderShare = vi.fn();
const mockFetchProjects = vi.fn();
vi.mock("../../access/api", () => ({
  fetchOutgoingShares: (...args: unknown[]) =>
    mockFetchOutgoingShares(...args),
  createFolderShare: (...args: unknown[]) =>
    mockCreateFolderShare(...args),
  patchFolderShareLevel: (...args: unknown[]) =>
    mockPatchFolderShareLevel(...args),
  deleteFolderShare: (...args: unknown[]) =>
    mockDeleteFolderShare(...args),
  fetchProjects: (...args: unknown[]) =>
    mockFetchProjects(...args),
}));

const mockListDropdowns = vi.fn().mockResolvedValue([]);
vi.mock("../../dropdowns/api", () => ({
  listDropdowns: (...args: unknown[]) => mockListDropdowns(...args),
}));

const mockPatchEntry = vi.fn();
const mockGetLockStatus = vi.fn().mockResolvedValue({ locked: false });
const mockPatchFolder = vi.fn();
vi.mock("../../eln/api", () => ({
  patchEntry: (...args: unknown[]) => mockPatchEntry(...args),
  getLockStatus: (...args: unknown[]) => mockGetLockStatus(...args),
  acquireLock: vi.fn(),
  releaseLock: vi.fn(),
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
    mockGetFolders.mockReset().mockResolvedValue([]);
    mockListDropdowns.mockReset().mockResolvedValue([]);
    mockPatchEntry.mockReset();
    mockGetLockStatus.mockReset().mockResolvedValue({ locked: false });
    mockPatchFolder.mockReset();
    mockDeleteFolder.mockReset();
    mockDeleteEntry.mockReset();
    mockFetchOutgoingShares.mockReset().mockResolvedValue([]);
    mockCreateFolderShare.mockReset();
    mockPatchFolderShareLevel.mockReset();
    mockDeleteFolderShare.mockReset();
    mockFetchProjects.mockReset();
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

  // ── Shared-out folder marker ─────────────────────────────────────

  it("renders shared-icon overlay on owned folder that is shared out", async () => {
    const response = makeLibraryContents(
      [
        makeLibraryFolder({
          id: 1,
          name: "Shared Out",
          share_summary: {
            shared: true,
            target_projects: [
              { id: 2, name: "Target Lab", icon_key: "flask", color_key: "crimson" },
            ],
          },
        }),
      ],
      [],
      {
        project_uid: "proj-001",
        project_name: "Test Project",
        project_is_archived: false,
      },
    );
    mockGetLibraryContents.mockResolvedValue(response);
    renderLibrary("/library?project=proj-001");
    await waitFor(() => {
      expect(screen.getByText("Shared Out")).toBeInTheDocument();
    });

    const overlays = document.querySelectorAll(".card-icon-overlay");
    expect(overlays.length).toBe(1);
  });

  it("shared-out folder icon has tooltip naming target projects", async () => {
    const response = makeLibraryContents(
      [
        makeLibraryFolder({
          id: 1,
          name: "Shared Out",
          share_summary: {
            shared: true,
            target_projects: [
              { id: 2, name: "Target Lab", icon_key: "flask", color_key: "crimson" },
              { id: 3, name: "Other Project", icon_key: "folder", color_key: "muted" },
            ],
          },
        }),
      ],
      [],
      {
        project_uid: "proj-001",
        project_name: "Test Project",
        project_is_archived: false,
      },
    );
    mockGetLibraryContents.mockResolvedValue(response);
    renderLibrary("/library?project=proj-001");
    await waitFor(() => {
      expect(screen.getByText("Shared Out")).toBeInTheDocument();
    });

    const cardIcon = document.querySelector(".card-icon[title]");
    expect(cardIcon).toBeInTheDocument();
    expect(cardIcon?.getAttribute("title")).toBe(
      "Shared with: Target Lab, Other Project",
    );
  });

  it("non-shared folder does not have shared overlay or tooltip", async () => {
    mockGetLibraryContents.mockResolvedValue(populatedContentsResponse);
    renderLibrary("/library?project=proj-001");
    await waitFor(() => {
      expect(screen.getByText("Protocols")).toBeInTheDocument();
    });

    const overlays = document.querySelectorAll(".card-icon-overlay");
    expect(overlays.length).toBe(0);

    const cardsWithTitle = document.querySelectorAll(".card-icon[title]");
    expect(cardsWithTitle.length).toBe(0);
  });

  // ── Row Menu & Properties Modal ──────────────────────────────────

  describe("Row Menu", () => {
    it("renders a three-dot button on every folder and entry row", async () => {
      mockGetLibraryContents.mockResolvedValue(populatedContentsResponse);
      renderLibrary("/library?project=proj-001");
      await waitFor(() => {
        expect(screen.getByText("Experiments")).toBeInTheDocument();
        expect(screen.getByText("Protocols")).toBeInTheDocument();
        expect(screen.getByText("EXP-0284")).toBeInTheDocument();
      });

      const rowActionButtons = screen.getAllByLabelText("Row actions");
      // 2 folders + 1 entry = 3 rows with RowMenu
      expect(rowActionButtons.length).toBe(3);
    });

    it("opens a menu with Properties item when three-dot is clicked", async () => {
      mockGetLibraryContents.mockResolvedValue(populatedContentsResponse);
      renderLibrary("/library?project=proj-001");
      await waitFor(() => {
        expect(screen.getByText("EXP-0284")).toBeInTheDocument();
      });

      const cards = screen.getAllByTestId("base-library-card");
      const entryCard = cards.find((card) =>
        card.textContent?.includes("EXP-0284"),
      )!;
      const rowMenuButton = within(entryCard).getByLabelText("Row actions");

      fireEvent.click(rowMenuButton);

      await waitFor(() => {
        expect(screen.getByText("Properties")).toBeInTheDocument();
      });
    });

    it("opens entry Properties Modal when Properties is clicked", async () => {
      mockGetLibraryContents.mockResolvedValue(populatedContentsResponse);
      renderLibrary("/library?project=proj-001");
      await waitFor(() => {
        expect(screen.getByText("EXP-0284")).toBeInTheDocument();
      });

      const cards = screen.getAllByTestId("base-library-card");
      const entryCard = cards.find((card) =>
        card.textContent?.includes("EXP-0284"),
      )!;
      fireEvent.click(within(entryCard).getByLabelText("Row actions"));

      await waitFor(() => {
        expect(screen.getByText("Properties")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Properties"));

      await waitFor(() => {
        expect(
          screen.getByRole("dialog", { name: "EXP-0284 — PCR Results" }),
        ).toBeInTheDocument();
      });
    });

    it("entry modal shows display ID and title in header", async () => {
      mockGetLibraryContents.mockResolvedValue(populatedContentsResponse);
      renderLibrary("/library?project=proj-001");
      await waitFor(() => {
        expect(screen.getByText("EXP-0284")).toBeInTheDocument();
      });

      const cards = screen.getAllByTestId("base-library-card");
      const entryCard = cards.find((card) =>
        card.textContent?.includes("EXP-0284"),
      )!;
      fireEvent.click(within(entryCard).getByLabelText("Row actions"));
      await waitFor(() => {
        expect(screen.getByText("Properties")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Properties"));

      await waitFor(() => {
        const dialog = screen.getByRole("dialog", {
          name: "EXP-0284 — PCR Results",
        });
        expect(dialog).toBeInTheDocument();
        expect(within(dialog).getByText("EXP-0284 — PCR Results")).toBeInTheDocument();
      });
    });

    it("entry modal shows read-only project, author, created, and updated fields", async () => {
      mockGetLibraryContents.mockResolvedValue(populatedContentsResponse);
      renderLibrary("/library?project=proj-001");
      await waitFor(() => {
        expect(screen.getByText("EXP-0284")).toBeInTheDocument();
      });

      const cards = screen.getAllByTestId("base-library-card");
      const entryCard = cards.find((card) =>
        card.textContent?.includes("EXP-0284"),
      )!;
      fireEvent.click(within(entryCard).getByLabelText("Row actions"));
      await waitFor(() => {
        expect(screen.getByText("Properties")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Properties"));

      await waitFor(() => {
        const dialog = screen.getByRole("dialog", {
          name: "EXP-0284 — PCR Results",
        });
        expect(within(dialog).getByText("Project")).toBeInTheDocument();
        expect(within(dialog).getByText("Test Project")).toBeInTheDocument();
        expect(within(dialog).getByText("Author")).toBeInTheDocument();
        expect(within(dialog).getByText("testuser")).toBeInTheDocument();
        expect(within(dialog).getByText("Created")).toBeInTheDocument();
        expect(within(dialog).getByText("Updated")).toBeInTheDocument();
      });
    });

    it("folder modal shows folder name as title and created date", async () => {
      mockGetLibraryContents.mockResolvedValue(populatedContentsResponse);
      renderLibrary("/library?project=proj-001");
      await waitFor(() => {
        expect(screen.getByText("Protocols")).toBeInTheDocument();
      });

      const cards = screen.getAllByTestId("base-library-card");
      const folderCard = cards.find((card) =>
        card.textContent?.includes("Protocols") && !card.textContent?.includes("EXP"),
      )!;
      fireEvent.click(within(folderCard).getByLabelText("Row actions"));
      await waitFor(() => {
        expect(screen.getByText("Properties")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Properties"));

      await waitFor(() => {
        const dialog = screen.getByRole("dialog", { name: "Protocols" });
        expect(dialog).toBeInTheDocument();
        expect(within(dialog).getByText("Created")).toBeInTheDocument();
      });
    });

    it("closes modal when the close button is clicked", async () => {
      mockGetLibraryContents.mockResolvedValue(populatedContentsResponse);
      renderLibrary("/library?project=proj-001");
      await waitFor(() => {
        expect(screen.getByText("EXP-0284")).toBeInTheDocument();
      });

      const cards = screen.getAllByTestId("base-library-card");
      const entryCard = cards.find((card) =>
        card.textContent?.includes("EXP-0284"),
      )!;
      fireEvent.click(within(entryCard).getByLabelText("Row actions"));
      await waitFor(() => {
        expect(screen.getByText("Properties")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Properties"));

      await waitFor(() => {
        expect(
          screen.getByRole("dialog", { name: "EXP-0284 — PCR Results" }),
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText("Close"));

      await waitFor(() => {
        expect(
          screen.queryByRole("dialog", { name: "EXP-0284 — PCR Results" }),
        ).toBeNull();
      });
    });

    it("keyboard Escape closes the modal", async () => {
      mockGetLibraryContents.mockResolvedValue(populatedContentsResponse);
      renderLibrary("/library?project=proj-001");
      await waitFor(() => {
        expect(screen.getByText("EXP-0284")).toBeInTheDocument();
      });

      const cards = screen.getAllByTestId("base-library-card");
      const entryCard = cards.find((card) =>
        card.textContent?.includes("EXP-0284"),
      )!;
      fireEvent.click(within(entryCard).getByLabelText("Row actions"));
      await waitFor(() => {
        expect(screen.getByText("Properties")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Properties"));

      await waitFor(() => {
        expect(
          screen.getByRole("dialog", { name: "EXP-0284 — PCR Results" }),
        ).toBeInTheDocument();
      });

      fireEvent.keyDown(document, { key: "Escape" });

      await waitFor(() => {
        expect(
          screen.queryByRole("dialog", { name: "EXP-0284 — PCR Results" }),
        ).toBeNull();
      });
    });
  });

  // ── Project cards have no RowMenu ───────────────────────────────

  describe("project cards", () => {
    it("do not show a RowMenu on project cards", async () => {
      mockGetAccessibleProjects.mockResolvedValue([
        makeProject({ id: 1, uid: "p1", name: "Alpha", current_user_role: "read" }),
      ]);
      renderLibrary();
      await waitFor(() => {
        expect(screen.getByText("Alpha")).toBeInTheDocument();
      });

      expect(screen.queryByLabelText("Row actions")).toBeNull();
    });

    it("do not show a RowMenu inside project cards when browsing project list", async () => {
      mockGetAccessibleProjects.mockResolvedValue([
        makeProject({ id: 1, uid: "p1", name: "Alpha" }),
        makeProject({ id: 2, uid: "p2", name: "Beta" }),
      ]);
      renderLibrary();
      await waitFor(() => {
        expect(screen.getByText("Alpha")).toBeInTheDocument();
        expect(screen.getByText("Beta")).toBeInTheDocument();
      });

      expect(screen.queryByLabelText("Row actions")).toBeNull();
    });
  });

  // ── Editable Entry Properties Modal ─────────────────────────────

  describe("editable entry properties modal", () => {
    const projEditEntry = makeProject({
      id: 1, uid: "proj-001", name: "Test Project",
      current_user_role: "edit",
    });

    async function openEntryPropertiesModal() {
      mockGetAccessibleProjects.mockResolvedValue([projEditEntry]);
      mockGetLibraryContents.mockResolvedValue(populatedContentsResponse);
      mockGetFolders.mockResolvedValue([
        { id: 1, name: "Experiments", path: "root / Experiments" },
        { id: 2, name: "Protocols", path: "root / Protocols" },
      ]);
      mockListDropdowns.mockResolvedValue([
        { id: 1, name: "Status", options: ["in_progress", "finished"] },
      ]);

      renderLibrary("/library?project=proj-001");
      await waitFor(() => {
        expect(screen.getByText("EXP-0284")).toBeInTheDocument();
      });

      const cards = screen.getAllByTestId("base-library-card");
      const entryCard = cards.find((card) =>
        card.textContent?.includes("EXP-0284"),
      )!;
      fireEvent.click(within(entryCard).getByLabelText("Row actions"));
      await waitFor(() => {
        expect(screen.getByText("Properties")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Properties"));
      await waitFor(() => {
        expect(
          screen.getByRole("dialog", { name: "EXP-0284 \u2014 PCR Results" }),
        ).toBeInTheDocument();
      });
      return screen.getByRole("dialog", { name: "EXP-0284 \u2014 PCR Results" });
    }

    it("shows status dropdown with helper text when user can edit", async () => {
      const dialog = await openEntryPropertiesModal();

      await waitFor(() => {
        expect(within(dialog).getByText("Status")).toBeInTheDocument();
      });

      const statusLabel = within(dialog).getByText("Status");
      const statusRow = statusLabel.closest("div")?.parentElement;
      expect(statusRow?.textContent).toContain("Cascades to entities created in this entry");

      const select = within(dialog).getByRole("combobox");
      expect(select).toBeInTheDocument();
      expect(select).not.toBeDisabled();
    });

    it("shows move picker with folder list when user can edit", async () => {
      const dialog = await openEntryPropertiesModal();

      await waitFor(() => {
        expect(within(dialog).getByText("Move to")).toBeInTheDocument();
      });

      const searchInput = within(dialog).getByPlaceholderText("Search folders...");
      expect(searchInput).toBeInTheDocument();
      expect(searchInput).not.toBeDisabled();

      await waitFor(() => {
        expect(within(dialog).getByText("root / Protocols")).toBeInTheDocument();
      });
    });

    it("excludes current folder from move picker", async () => {
      mockGetLibraryContents.mockResolvedValue(
        makeLibraryContents(
          [makeLibraryFolder({ id: 1, name: "Experiments" })],
          [
            makeLibraryEntry({
              id: 10, workspace_id: "eln", display_id: "EXP-0284",
              title: "PCR Results", folder: 1, folder_name: "Experiments",
              status: "in_progress",
            }),
          ],
          { project_uid: "proj-001", project_name: "Test Project" },
        ),
      );
      mockGetFolders.mockResolvedValue([
        { id: 1, name: "Experiments", path: "root / Experiments" },
        { id: 2, name: "Protocols", path: "root / Protocols" },
      ]);

      const dialog = await openEntryPropertiesModal();

      await waitFor(() => {
        expect(within(dialog).getByText("root / Protocols")).toBeInTheDocument();
      });
      expect(within(dialog).queryByText("root / Experiments")).toBeNull();
    });

    it("filters move picker by search text", async () => {
      const dialog = await openEntryPropertiesModal();

      await waitFor(() => {
        expect(within(dialog).getByText("root / Protocols")).toBeInTheDocument();
      });

      const searchInput = within(dialog).getByPlaceholderText("Search folders...");
      fireEvent.change(searchInput, { target: { value: "Proto" } });

      await waitFor(() => {
        expect(within(dialog).getByText("root / Protocols")).toBeInTheDocument();
      });
      expect(within(dialog).queryByText("root / Experiments")).toBeNull();
    });

    it("hides status and move controls for read-only viewers", async () => {
      mockGetAccessibleProjects.mockResolvedValue([
        makeProject({ id: 1, uid: "proj-001", name: "Test Project", current_user_role: "read" }),
      ]);
      mockGetLibraryContents.mockResolvedValue(populatedContentsResponse);

      renderLibrary("/library?project=proj-001");
      await waitFor(() => {
        expect(screen.getByText("EXP-0284")).toBeInTheDocument();
      });

      const cards = screen.getAllByTestId("base-library-card");
      const entryCard = cards.find((card) =>
        card.textContent?.includes("EXP-0284"),
      )!;
      fireEvent.click(within(entryCard).getByLabelText("Row actions"));
      await waitFor(() => {
        expect(screen.getByText("Properties")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Properties"));

      await waitFor(() => {
        const dialog = screen.getByRole("dialog", {
          name: "EXP-0284 \u2014 PCR Results",
        });
        expect(dialog).toBeInTheDocument();
      });

      const dialog = screen.getByRole("dialog", {
        name: "EXP-0284 \u2014 PCR Results",
      });
      expect(within(dialog).queryByText("Status")).toBeNull();
      expect(within(dialog).queryByText("Move to")).toBeNull();
      expect(within(dialog).queryByPlaceholderText("Search folders...")).toBeNull();
    });

    it("disables editable fields when locked by another user", async () => {
      mockGetLockStatus.mockResolvedValue({
        locked: true,
        held_by: 99,
        held_by_username: "other_user",
      });

      const dialog = await openEntryPropertiesModal();

      await waitFor(() => {
        expect(within(dialog).getByText("Status")).toBeInTheDocument();
      });

      const select = within(dialog).getByRole("combobox");
      expect(select).toBeDisabled();

      const searchInput = within(dialog).queryByPlaceholderText("Search folders...");
      if (searchInput) {
        expect(searchInput).toBeDisabled();
      }
    });

    it("shows read-only project, author, created, updated fields in editable modal too", async () => {
      const dialog = await openEntryPropertiesModal();

      await waitFor(() => {
        expect(within(dialog).getByText("Project")).toBeInTheDocument();
        expect(within(dialog).getByText("Author")).toBeInTheDocument();
        expect(within(dialog).getByText("Created")).toBeInTheDocument();
        expect(within(dialog).getByText("Updated")).toBeInTheDocument();
      });
    });
  });

  // ── Folder rename from Properties Modal ────────────────────────────

  describe("folder rename from properties modal", () => {
    const projEdit = makeProject({
      id: 1, uid: "proj-001", name: "Test Project",
      current_user_role: "edit",
    });

    async function openFolderPropertiesModal() {
      mockGetAccessibleProjects.mockResolvedValue([projEdit]);
      mockGetLibraryContents.mockResolvedValue(populatedContentsResponse);
      mockGetFolders.mockResolvedValue([]);

      renderLibrary("/library?project=proj-001");
      await waitFor(() => {
        expect(screen.getByText("Protocols")).toBeInTheDocument();
      });

      const cards = screen.getAllByTestId("base-library-card");
      const folderCard = cards.find((card) =>
        card.textContent?.includes("Protocols") && !card.textContent?.includes("EXP"),
      )!;
      fireEvent.click(within(folderCard).getByLabelText("Row actions"));
      await waitFor(() => {
        expect(screen.getByText("Properties")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Properties"));
      await waitFor(() => {
        expect(screen.getByRole("dialog", { name: "Protocols" })).toBeInTheDocument();
      });
      return screen.getByRole("dialog", { name: "Protocols" });
    }

    it("shows editable name input when user can edit", async () => {
      const dialog = await openFolderPropertiesModal();

      await waitFor(() => {
        expect(within(dialog).getByText("Name")).toBeInTheDocument();
      });

      const nameInput = within(dialog).getByRole("textbox");
      expect(nameInput).toBeInTheDocument();
      expect(nameInput).not.toBeDisabled();
      expect(nameInput).toHaveValue("Protocols");
    });

    it("shows read-only name when user can only read", async () => {
      mockGetAccessibleProjects.mockResolvedValue([
        makeProject({ id: 1, uid: "proj-001", name: "Test Project", current_user_role: "read" }),
      ]);
      mockGetLibraryContents.mockResolvedValue(populatedContentsResponse);

      renderLibrary("/library?project=proj-001");
      await waitFor(() => {
        expect(screen.getByText("Protocols")).toBeInTheDocument();
      });

      const cards = screen.getAllByTestId("base-library-card");
      const folderCard = cards.find((card) =>
        card.textContent?.includes("Protocols") && !card.textContent?.includes("EXP"),
      )!;
      fireEvent.click(within(folderCard).getByLabelText("Row actions"));
      await waitFor(() => {
        expect(screen.getByText("Properties")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Properties"));
      await waitFor(() => {
        expect(screen.getByRole("dialog", { name: "Protocols" })).toBeInTheDocument();
      });

      const dialog = screen.getByRole("dialog", { name: "Protocols" });
      expect(within(dialog).getByText("Name")).toBeInTheDocument();
      expect(within(dialog).queryByRole("textbox")).toBeNull();
      const nameElements = within(dialog).getAllByText("Protocols");
      expect(nameElements.length).toBeGreaterThanOrEqual(1);
    });

    it("commits rename on Enter key", async () => {
      mockPatchFolder.mockResolvedValue({
        type: "folder", id: 2, name: "RenamedProtocols", parent: null,
        created_at: "2025-01-02T00:00:00Z",
      });
      const dialog = await openFolderPropertiesModal();

      const nameInput = within(dialog).getByRole("textbox");
      fireEvent.change(nameInput, { target: { value: "RenamedProtocols" } });
      fireEvent.keyDown(nameInput, { key: "Enter" });

      await waitFor(() => {
        expect(mockPatchFolder).toHaveBeenCalledWith(2, { name: "RenamedProtocols" });
      });
    });

    it("commits rename on blur", async () => {
      mockPatchFolder.mockResolvedValue({
        type: "folder", id: 2, name: "BlurRenamed", parent: null,
        created_at: "2025-01-02T00:00:00Z",
      });
      const dialog = await openFolderPropertiesModal();

      const nameInput = within(dialog).getByRole("textbox");
      fireEvent.change(nameInput, { target: { value: "BlurRenamed" } });
      fireEvent.blur(nameInput);

      await waitFor(() => {
        expect(mockPatchFolder).toHaveBeenCalledWith(2, { name: "BlurRenamed" });
      });
    });

    it("shows inline error on rename failure", async () => {
      mockPatchFolder.mockRejectedValue(new Error("A folder named \"Conflict\" already exists in this project."));
      const dialog = await openFolderPropertiesModal();

      const nameInput = within(dialog).getByRole("textbox");
      fireEvent.change(nameInput, { target: { value: "Conflict" } });
      fireEvent.keyDown(nameInput, { key: "Enter" });

      await waitFor(() => {
        expect(
          within(dialog).getByText("A folder named \"Conflict\" already exists in this project."),
        ).toBeInTheDocument();
      });
    });

    it("reverts to original name in input on rename failure", async () => {
      mockPatchFolder.mockRejectedValue(new Error("Name collision"));
      const dialog = await openFolderPropertiesModal();

      const nameInput = within(dialog).getByRole("textbox");
      fireEvent.change(nameInput, { target: { value: "ConflictName" } });
      fireEvent.keyDown(nameInput, { key: "Enter" });

      await waitFor(() => {
        expect(within(dialog).getByText("Name collision")).toBeInTheDocument();
      });

      expect(nameInput).toHaveValue("Protocols");
    });

    it("does not call API when name is unchanged", async () => {
      const dialog = await openFolderPropertiesModal();

      const nameInput = within(dialog).getByRole("textbox");
      fireEvent.change(nameInput, { target: { value: "Protocols" } });
      fireEvent.keyDown(nameInput, { key: "Enter" });

      await waitFor(() => {
        // No error, but also no API call
        expect(within(dialog).queryByText(/exists/i)).toBeNull();
      });
      expect(mockPatchFolder).not.toHaveBeenCalled();
    });

    it("commits rename on modal close (blur)", async () => {
      mockPatchFolder.mockResolvedValue({
        type: "folder", id: 2, name: "CloseRenamed", parent: null,
        created_at: "2025-01-02T00:00:00Z",
      });
      const dialog = await openFolderPropertiesModal();

      const nameInput = within(dialog).getByRole("textbox");
      fireEvent.change(nameInput, { target: { value: "CloseRenamed" } });
      fireEvent.click(screen.getByLabelText("Close"));

      await waitFor(() => {
        expect(mockPatchFolder).toHaveBeenCalledWith(2, { name: "CloseRenamed" });
      });
    });
  });

  // ── Sharing Panel ──────────────────────────────────────────────────

  describe("sharing panel in folder properties modal", () => {
    const orgAdminProject = makeProject({
      id: 1, uid: "proj-001", name: "Test Project",
      current_user_role: null,
    });

    const shareContents = makeLibraryContents(
      [
        makeLibraryFolder({ id: 1, name: "Experiments", parent: null }),
      ],
      [],
      {
        project_uid: "proj-001",
        project_name: "Test Project",
        current_project_id: 1,
      },
    );

    const otherProject = makeProject({ id: 2, uid: "proj-002", name: "Other Project", current_user_role: "read" });

    async function openSharingModal() {
      mockGetAccessibleProjects.mockResolvedValue([orgAdminProject]);
      mockGetLibraryContents.mockResolvedValue(shareContents);
      mockGetFolders.mockResolvedValue([]);
      mockFetchProjects.mockResolvedValue([orgAdminProject, otherProject]);

      renderLibrary("/library?project=proj-001");
      await waitFor(() => {
        expect(screen.getByText("Experiments")).toBeInTheDocument();
      });

      const cards = screen.getAllByTestId("base-library-card");
      const folderCard = cards.find((card) =>
        card.textContent?.includes("Experiments") && !card.textContent?.includes("EXP"),
      )!;
      fireEvent.click(within(folderCard).getByLabelText("Row actions"));
      await waitFor(() => {
        expect(screen.getByText("Properties")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Properties"));
      await waitFor(() => {
        expect(screen.getByRole("dialog", { name: "Experiments" })).toBeInTheDocument();
      });
      return screen.getByRole("dialog", { name: "Experiments" });
    }

    it("shows sharing panel for org admin on top-level folder in own project", async () => {
      const dialog = await openSharingModal();

      await waitFor(() => {
        expect(within(dialog).getByText("Sharing")).toBeInTheDocument();
      });
    });

    it("does not show sharing panel for non-admin editor", async () => {
      mockGetAccessibleProjects.mockResolvedValue([
        makeProject({ id: 1, uid: "proj-001", name: "Test Project", current_user_role: "edit" }),
      ]);
      mockGetLibraryContents.mockResolvedValue(shareContents);
      mockGetFolders.mockResolvedValue([]);

      renderLibrary("/library?project=proj-001");
      await waitFor(() => {
        expect(screen.getByText("Experiments")).toBeInTheDocument();
      });

      const cards = screen.getAllByTestId("base-library-card");
      const folderCard = cards.find((card) =>
        card.textContent?.includes("Experiments") && !card.textContent?.includes("EXP"),
      )!;
      fireEvent.click(within(folderCard).getByLabelText("Row actions"));
      await waitFor(() => {
        expect(screen.getByText("Properties")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Properties"));
      await waitFor(() => {
        expect(screen.getByRole("dialog", { name: "Experiments" })).toBeInTheDocument();
      });

      const dialog = screen.getByRole("dialog", { name: "Experiments" });
      expect(within(dialog).queryByText("Sharing")).toBeNull();
      expect(within(dialog).queryByText(/only top-level folders/i)).toBeNull();
    });

    it("shows nested-folder hint for org admin on nested folder", async () => {
      const nestedContents = makeLibraryContents(
        [makeLibraryFolder({ id: 1, name: "SubFolder", parent: 2 })],
        [],
        { project_uid: "proj-001", project_name: "Test Project", current_project_id: 1 },
      );
      mockGetAccessibleProjects.mockResolvedValue([orgAdminProject]);
      mockGetLibraryContents.mockResolvedValue(nestedContents);
      mockGetFolders.mockResolvedValue([]);

      renderLibrary("/library?project=proj-001");
      await waitFor(() => {
        expect(screen.getByText("SubFolder")).toBeInTheDocument();
      });

      const cards = screen.getAllByTestId("base-library-card");
      const folderCard = cards.find((card) =>
        card.textContent?.includes("SubFolder"),
      )!;
      fireEvent.click(within(folderCard).getByLabelText("Row actions"));
      await waitFor(() => {
        expect(screen.getByText("Properties")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Properties"));
      await waitFor(() => {
        expect(screen.getByRole("dialog", { name: "SubFolder" })).toBeInTheDocument();
      });

      const dialog = screen.getByRole("dialog", { name: "SubFolder" });
      expect(within(dialog).getByText("Only top-level folders can be shared.")).toBeInTheDocument();
      expect(within(dialog).queryByText("Add")).toBeNull();
    });

    it("renders existing shares with level dropdown and revoke button", async () => {
      mockFetchOutgoingShares.mockResolvedValue([
        makeFolderShare({ id: 1, target_project_name: "Other Project", level: "read" }),
      ]);

      const dialog = await openSharingModal();

      await waitFor(() => {
        expect(within(dialog).getByText("Other Project")).toBeInTheDocument();
      });

      const levelSelect = within(dialog).getAllByTestId("share-level-select")[0];
      expect(levelSelect).toHaveValue("read");
      expect(within(dialog).getByTestId("revoke-share-button")).toBeInTheDocument();
    });

    it("updates share level on dropdown change", async () => {
      mockFetchOutgoingShares.mockResolvedValue([
        makeFolderShare({ id: 1, target_project_name: "Other Project", level: "read" }),
      ]);
      mockPatchFolderShareLevel.mockResolvedValue(
        makeFolderShare({ id: 1, target_project_name: "Other Project", level: "read_write" }),
      );

      const dialog = await openSharingModal();
      await waitFor(() => {
        expect(within(dialog).getByText("Other Project")).toBeInTheDocument();
      });

      const levelSelect = within(dialog).getAllByTestId("share-level-select")[0];
      fireEvent.change(levelSelect, { target: { value: "read_write" } });

      await waitFor(() => {
        expect(mockPatchFolderShareLevel).toHaveBeenCalledWith(1, "read_write");
      });
    });

    it("revokes share after window.confirm", async () => {
      window.confirm = vi.fn().mockReturnValue(true);
      mockFetchOutgoingShares.mockResolvedValue([
        makeFolderShare({ id: 1, target_project_name: "Other Project", level: "read" }),
      ]);
      mockDeleteFolderShare.mockResolvedValue(undefined);

      const dialog = await openSharingModal();
      await waitFor(() => {
        expect(within(dialog).getByText("Other Project")).toBeInTheDocument();
      });

      fireEvent.click(within(dialog).getByTestId("revoke-share-button"));

      await waitFor(() => {
        expect(window.confirm).toHaveBeenCalledWith('Revoke share to "Other Project"?');
      });

      await waitFor(() => {
        expect(mockDeleteFolderShare).toHaveBeenCalledWith(1);
      });
    });

    it("does not revoke when confirm is cancelled", async () => {
      window.confirm = vi.fn().mockReturnValue(false);
      mockFetchOutgoingShares.mockResolvedValue([
        makeFolderShare({ id: 1, target_project_name: "Other Project", level: "read" }),
      ]);

      const dialog = await openSharingModal();
      await waitFor(() => {
        expect(within(dialog).getByText("Other Project")).toBeInTheDocument();
      });

      fireEvent.click(within(dialog).getByTestId("revoke-share-button"));

      await waitFor(() => {
        expect(window.confirm).toHaveBeenCalledWith('Revoke share to "Other Project"?');
      });

      expect(mockDeleteFolderShare).not.toHaveBeenCalled();
    });

    it("adds a share from the add-share row", async () => {
      mockFetchProjects.mockResolvedValue([orgAdminProject, otherProject]);
      mockCreateFolderShare.mockResolvedValue(
        makeFolderShare({ id: 2, target_project: 2, target_project_name: "Other Project", level: "read" }),
      );

      const dialog = await openSharingModal();

      const projectSelect = within(dialog).getByTestId("add-share-project-select");
      fireEvent.change(projectSelect, { target: { value: "2" } });

      await waitFor(() => {
        const addButton = within(dialog).getByTestId("add-share-button") as HTMLButtonElement;
        expect(addButton.disabled).toBe(false);
      });

      fireEvent.click(within(dialog).getByTestId("add-share-button"));

      await waitFor(() => {
        expect(mockCreateFolderShare).toHaveBeenCalledWith(2, {
          source_folder: 1,
          level: "read",
        });
      });
    });

    it("shows inline error on failed add-share", async () => {
      mockFetchProjects.mockResolvedValue([orgAdminProject, otherProject]);
      mockCreateFolderShare.mockRejectedValue(
        new Error("A shared Folder named \"Experiments\" already exists in the target Project."),
      );

      const dialog = await openSharingModal();

      const projectSelect = within(dialog).getByTestId("add-share-project-select");
      fireEvent.change(projectSelect, { target: { value: "2" } });

      fireEvent.click(within(dialog).getByTestId("add-share-button"));

      await waitFor(() => {
        expect(
          within(dialog).getByTestId("add-share-error"),
        ).toHaveTextContent("A shared Folder named \"Experiments\" already exists in the target Project.");
      });
    });

    it("does not show sharing panel for shared folder viewed through share", async () => {
      const sharedFolderContents = makeLibraryContents(
        [
          makeLibraryFolder({
            id: 1, name: "Experiments", parent: null,
            is_shared: true, source_project_id: 2, source_project_name: "Source Project",
          }),
        ],
        [],
        { project_uid: "proj-001", project_name: "Test Project", current_project_id: 1 },
      );
      mockGetAccessibleProjects.mockResolvedValue([orgAdminProject]);
      mockGetLibraryContents.mockResolvedValue(sharedFolderContents);
      mockGetFolders.mockResolvedValue([]);

      renderLibrary("/library?project=proj-001");
      await waitFor(() => {
        expect(screen.getByText("Experiments")).toBeInTheDocument();
      });

      const cards = screen.getAllByTestId("base-library-card");
      const folderCard = cards.find((card) =>
        card.textContent?.includes("Experiments") && !card.textContent?.includes("EXP"),
      )!;
      fireEvent.click(within(folderCard).getByLabelText("Row actions"));
      await waitFor(() => {
        expect(screen.getByText("Properties")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Properties"));
      await waitFor(() => {
        expect(screen.getByRole("dialog", { name: "Experiments" })).toBeInTheDocument();
      });

      const dialog = screen.getByRole("dialog", { name: "Experiments" });
      expect(within(dialog).queryByText("Sharing")).toBeNull();
      expect(within(dialog).queryByText(/only top-level folders/i)).toBeNull();
    });
  });

  // ── Row Menu Delete ─────────────────────────────────────────────────

  describe("Row Menu Delete", () => {
    const editProject = makeProject({
      id: 1, uid: "proj-001", name: "Test Project",
      current_user_role: "edit",
    });

    const readProject = makeProject({
      id: 1, uid: "proj-001", name: "Test Project",
      current_user_role: "read",
    });

    function getFolderRowMenu(name: string) {
      const cards = screen.getAllByTestId("base-library-card");
      const card = cards.find((c) =>
        c.textContent?.includes(name) && !c.textContent?.includes("EXP"),
      )!;
      return { card, button: within(card).getByLabelText("Row actions") };
    }

    function getEntryRowMenu(name: string) {
      const cards = screen.getAllByTestId("base-library-card");
      const card = cards.find((c) =>
        c.textContent?.includes(name),
      )!;
      return { card, button: within(card).getByLabelText("Row actions") };
    }

    it("shows Delete item for Edit users on own folders", async () => {
      mockGetAccessibleProjects.mockResolvedValue([editProject]);
      mockGetLibraryContents.mockResolvedValue(populatedContentsResponse);
      renderLibrary("/library?project=proj-001");
      await waitFor(() => {
        expect(screen.getByText("Protocols")).toBeInTheDocument();
      });

      const { button } = getFolderRowMenu("Protocols");
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText("Delete")).toBeInTheDocument();
      });
    });

    it("shows Delete item for Edit users on entries", async () => {
      mockGetAccessibleProjects.mockResolvedValue([editProject]);
      mockGetLibraryContents.mockResolvedValue(populatedContentsResponse);
      renderLibrary("/library?project=proj-001");
      await waitFor(() => {
        expect(screen.getByText("EXP-0284")).toBeInTheDocument();
      });

      const { button } = getEntryRowMenu("EXP-0284");
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText("Delete")).toBeInTheDocument();
      });
    });

    it("does not show Delete item for Read viewers", async () => {
      mockGetAccessibleProjects.mockResolvedValue([readProject]);
      mockGetLibraryContents.mockResolvedValue(populatedContentsResponse);
      renderLibrary("/library?project=proj-001");
      await waitFor(() => {
        expect(screen.getByText("Experiments")).toBeInTheDocument();
      });

      const { button } = getFolderRowMenu("Experiments");
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText("Properties")).toBeInTheDocument();
      });
      expect(screen.queryByText("Delete")).toBeNull();
    });

    it("does not show Delete when canDelete prop is false", () => {
      render(
        <MemoryRouter>
          <RowMenu
            onProperties={vi.fn()}
            canDelete={false}
            onDelete={vi.fn()}
          />
        </MemoryRouter>,
      );

      fireEvent.click(screen.getByLabelText("Row actions"));

      expect(screen.getByText("Properties")).toBeInTheDocument();
      expect(screen.queryByText("Delete")).toBeNull();
    });

    it("folder delete confirms with blast-radius wording", async () => {
      mockGetAccessibleProjects.mockResolvedValue([editProject]);
      mockGetLibraryContents.mockResolvedValue(populatedContentsResponse);
      mockDeleteFolder.mockResolvedValue(undefined);
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

      renderLibrary("/library?project=proj-001");
      await waitFor(() => {
        expect(screen.getByText("Protocols")).toBeInTheDocument();
      });

      const { button } = getFolderRowMenu("Protocols");
      fireEvent.click(button);
      await waitFor(() => expect(screen.getByText("Delete")).toBeInTheDocument());
      fireEvent.click(screen.getByText("Delete"));

      expect(confirmSpy).toHaveBeenCalledWith(
        'Delete folder "Protocols"? Everything inside it is permanently deleted.',
      );
      await waitFor(() => {
        expect(mockDeleteFolder).toHaveBeenCalledWith(2);
      });

      confirmSpy.mockRestore();
    });

    it("folder delete confirms with share info when shared", async () => {
      const folderWithShare = makeLibraryFolder({
        id: 1, name: "Experiments",
        share_summary: {
          shared: true,
          target_projects: [
            { id: 2, name: "Lab B", icon_key: "flask", color_key: "crimson" },
            { id: 3, name: "Lab C", icon_key: "flask", color_key: "blue" },
          ],
        },
      });
      const contents = makeLibraryContents(
        [folderWithShare],
        [],
        { project_uid: "proj-001", project_name: "Test Project" },
      );
      mockGetAccessibleProjects.mockResolvedValue([editProject]);
      mockGetLibraryContents.mockResolvedValue(contents);
      mockDeleteFolder.mockResolvedValue(undefined);
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

      renderLibrary("/library?project=proj-001");
      await waitFor(() => {
        expect(screen.getByText("Experiments")).toBeInTheDocument();
      });

      const { button } = getFolderRowMenu("Experiments");
      fireEvent.click(button);
      await waitFor(() => expect(screen.getByText("Delete")).toBeInTheDocument());
      fireEvent.click(screen.getByText("Delete"));

      expect(confirmSpy).toHaveBeenCalledWith(
        'Delete folder "Experiments"? Everything inside it is permanently deleted. It is shared with 2 project(s); deleting revokes all shares.',
      );

      confirmSpy.mockRestore();
    });

    it("entry delete confirms with its own wording", async () => {
      mockGetAccessibleProjects.mockResolvedValue([editProject]);
      mockGetLibraryContents.mockResolvedValue(populatedContentsResponse);
      mockDeleteEntry.mockResolvedValue(undefined);
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

      renderLibrary("/library?project=proj-001");
      await waitFor(() => {
        expect(screen.getByText("EXP-0284")).toBeInTheDocument();
      });

      const { button } = getEntryRowMenu("EXP-0284");
      fireEvent.click(button);
      await waitFor(() => expect(screen.getByText("Delete")).toBeInTheDocument());
      fireEvent.click(screen.getByText("Delete"));

      expect(confirmSpy).toHaveBeenCalledWith(
        'Delete entry "PCR Results"? This cannot be undone.',
      );
      await waitFor(() => {
        expect(mockDeleteEntry).toHaveBeenCalledWith("EXP-0284");
      });

      confirmSpy.mockRestore();
    });

    it("does not delete when confirmation is cancelled", async () => {
      mockGetAccessibleProjects.mockResolvedValue([editProject]);
      mockGetLibraryContents.mockResolvedValue(populatedContentsResponse);
      mockDeleteFolder.mockResolvedValue(undefined);
      vi.spyOn(window, "confirm").mockReturnValue(false);

      renderLibrary("/library?project=proj-001");
      await waitFor(() => {
        expect(screen.getByText("Protocols")).toBeInTheDocument();
      });

      const { button } = getFolderRowMenu("Protocols");
      fireEvent.click(button);
      await waitFor(() => expect(screen.getByText("Delete")).toBeInTheDocument());
      fireEvent.click(screen.getByText("Delete"));

      expect(mockDeleteFolder).not.toHaveBeenCalled();
    });

    it("refreshes contents after successful delete", async () => {
      mockGetAccessibleProjects.mockResolvedValue([editProject]);
      mockGetLibraryContents.mockResolvedValue(populatedContentsResponse);
      mockDeleteFolder.mockResolvedValue(undefined);
      vi.spyOn(window, "confirm").mockReturnValue(true);

      renderLibrary("/library?project=proj-001");
      await waitFor(() => {
        expect(screen.getByText("Protocols")).toBeInTheDocument();
      });

      mockGetLibraryContents.mockClear();

      const { button } = getFolderRowMenu("Protocols");
      fireEvent.click(button);
      await waitFor(() => expect(screen.getByText("Delete")).toBeInTheDocument());
      fireEvent.click(screen.getByText("Delete"));

      await waitFor(() => {
        expect(mockDeleteFolder).toHaveBeenCalledWith(2);
      });

      await waitFor(() => {
        expect(mockGetLibraryContents).toHaveBeenCalled();
      });
    });

    it("renders Delete item with danger styling", async () => {
      mockGetAccessibleProjects.mockResolvedValue([editProject]);
      mockGetLibraryContents.mockResolvedValue(populatedContentsResponse);
      renderLibrary("/library?project=proj-001");
      await waitFor(() => {
        expect(screen.getByText("Protocols")).toBeInTheDocument();
      });

      const { button } = getFolderRowMenu("Protocols");
      fireEvent.click(button);

      await waitFor(() => {
        const deleteItem = screen.getByRole("menuitem", { name: "Delete" });
        expect(deleteItem).toBeInTheDocument();
      });
    });
  });
});
