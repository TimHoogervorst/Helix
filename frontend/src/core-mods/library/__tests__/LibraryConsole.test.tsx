import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { makeLibraryFolder, makeLibraryEntry, makeLibraryContents, makeMockReferenceBadge } from "../../../test/factories";
import LibraryConsole from "../console/LibraryConsole";

// ── Mocks ────────────────────────────────────────────────────────────

const mockGetLibraryContents = vi.fn();
vi.mock("../api", () => ({
  getLibraryContents: (...args: unknown[]) => mockGetLibraryContents(...args),
}));

// Mock ConsoleProvider
vi.mock("../../../core/console/ConsoleContext", () => ({
  useConsole: () => ({
    viewState: "list",
    setViewState: vi.fn(),
  }),
  ConsoleProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock ReferenceBadge
vi.mock("../../../shared/ReferenceBadge", () => ({
  default: makeMockReferenceBadge(),
}));

// Mock ModRegistry — LibraryConsole resolves the ELN detail card via the registry
vi.mock("../../../core/mod-system/ModRegistry", () => ({
  ModRegistry: {
    getInstance: () => ({
      resolveWorkspaceRenderers: () => ({
        detailCard: ({ entry }: { entry: { display_id: string; title: string } }) => (
          <div data-testid="eln-detail-card">Detail: {entry.title}</div>
        ),
        workspace: undefined,
      }),
    }),
  },
}));

// ── Fixtures ─────────────────────────────────────────────────────────

const emptyResponse = makeLibraryContents();

const populatedResponse = makeLibraryContents(
  [
    makeLibraryFolder({ id: 1 }),
    makeLibraryFolder({ id: 2, name: "Protocols", created_at: "2025-01-02T00:00:00Z" }),
  ],
  [
    makeLibraryEntry({
      id: 10,
      folder: 1,
      folder_name: "Experiments",
      author_username: "testuser",
      created_at: "2025-01-03T00:00:00Z",
      updated_at: "2025-01-03T00:00:00Z",
    }),
  ],
);

// ── Helpers ──────────────────────────────────────────────────────────

function renderLibrary(initialRoute = "/library") {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <LibraryConsole />
    </MemoryRouter>,
  );
}

// ── Tests ────────────────────────────────────────────────────────────

describe("LibraryConsole", () => {
  beforeEach(() => {
    mockGetLibraryContents.mockReset();
  });

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

  it("renders breadcrumbs with root as current", async () => {
    mockGetLibraryContents.mockResolvedValue(emptyResponse);
    renderLibrary();
    await waitFor(() => {
      const root = screen.getByText(/root/);
      expect(root.className).toContain("is-current");
    });
  });

  it("renders folders and entries from API", async () => {
    mockGetLibraryContents.mockResolvedValue(populatedResponse);
    renderLibrary();
    await waitFor(() => {
      expect(screen.getByText(/Protocols/)).toBeInTheDocument();
    });
    // Title appears in the Name column; badge renders displayId
    const badge = screen.getByTestId("ref-badge");
    expect(badge).toHaveAttribute("data-display-id", "E1");
    expect(screen.getByText("PCR Results")).toBeInTheDocument();
    // Experiments appears in both folder name and entry's folder_name column
    expect(screen.getAllByText(/Experiments/).length).toBeGreaterThanOrEqual(2);
  });

  it("renders the + new button", async () => {
    mockGetLibraryContents.mockResolvedValue(emptyResponse);
    renderLibrary();
    await waitFor(() => {
      expect(screen.getByTitle("New folder or entry")).toBeInTheDocument();
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

  it("ignores legacy search param from URL (search is removed)", async () => {
    mockGetLibraryContents.mockResolvedValue(emptyResponse);
    renderLibrary("/library?search=PCR");
    await waitFor(() => {
      // Search param should NOT be passed to API — only path and no search argument
      expect(mockGetLibraryContents).toHaveBeenCalledWith(
        "",
        undefined,
      );
    });
  });
});
