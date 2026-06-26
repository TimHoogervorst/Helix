import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LibraryView from "../LibraryView";
import type { LibraryContentsResponse } from "../../types/library";

// ── Mocks ────────────────────────────────────────────────────────────

const mockGetLibraryContents = vi.fn();
vi.mock("../../api/library", () => ({
  getLibraryContents: (...args: unknown[]) => mockGetLibraryContents(...args),
}));

// Mock context
vi.mock("../../context/LibraryViewContext", () => ({
  useLibraryView: () => ({
    viewState: "list",
    setViewState: vi.fn(),
  }),
  LibraryViewProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock ReferenceBadge
vi.mock("../../components/ReferenceBadge", () => ({
  default: ({
    displayId,
    resolved,
  }: {
    displayId: string;
    resolved?: { title: string };
  }) => (
    <span data-testid="ref-badge" data-display-id={displayId}>
      {resolved?.title ?? displayId}
    </span>
  ),
}));

// Mock ContentPreview (TipTap is heavy)
vi.mock("../../components/ContentPreview", () => ({
  default: ({ content }: { content: unknown }) => (
    <div data-testid="content-preview">
      {content ? "Content rendered" : "No content"}
    </div>
  ),
}));

// Mock useContentPreview
vi.mock("../../hooks/useContentPreview", () => ({
  useContentPreview: () => ({
    content: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hi." }] }],
    },
    loading: false,
    error: null,
  }),
}));

// Mock ElnEditor (heavy, tested separately)
vi.mock("../../components/ElnEditor", () => ({
  default: ({ entryId }: { entryId?: string }) => (
    <div data-testid="eln-editor">Editor for {entryId}</div>
  ),
}));

// ── Fixtures ─────────────────────────────────────────────────────────

const emptyResponse: LibraryContentsResponse = {
  count: 0,
  next: null,
  previous: null,
  results: [],
  current_folder_id: null,
};

const populatedResponse: LibraryContentsResponse = {
  count: 3,
  next: null,
  previous: null,
  results: [
    {
      type: "folder",
      id: 1,
      name: "Experiments",
      parent: null,
      created_at: "2025-01-01T00:00:00Z",
    },
    {
      type: "folder",
      id: 2,
      name: "Protocols",
      parent: null,
      created_at: "2025-01-02T00:00:00Z",
    },
    {
      type: "entry",
      id: 10,
      display_id: "E1",
      title: "PCR Results",
      folder: 1,
      folder_name: "Experiments",
      author_username: "testuser",
      created_at: "2025-01-03T00:00:00Z",
      updated_at: "2025-01-03T00:00:00Z",
    },
  ],
  current_folder_id: null,
};

// ── Helpers ──────────────────────────────────────────────────────────

function renderLibrary(initialRoute = "/library") {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <LibraryView />
    </MemoryRouter>,
  );
}

// ── Tests ────────────────────────────────────────────────────────────

describe("LibraryView", () => {
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
    // Title appears in both ReferenceBadge and the Name column
    expect(screen.getAllByText("PCR Results").length).toBeGreaterThanOrEqual(2);
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
        undefined,
      );
    });
  });

  it("passes search param from URL to API", async () => {
    mockGetLibraryContents.mockResolvedValue(emptyResponse);
    renderLibrary("/library?search=PCR");
    await waitFor(() => {
      expect(mockGetLibraryContents).toHaveBeenCalledWith(
        "",
        undefined,
        "PCR",
      );
    });
  });
});
