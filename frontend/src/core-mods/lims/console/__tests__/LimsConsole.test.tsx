import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { EntityListItem, PaginatedResponse } from "../../types";
import { emptyPage, makeEntityListItem, makeEntityPage, makeMockReferenceBadge } from "../../../../test/factories";
import LimsConsole from "../LimsConsole";

// ── API client mock ───────────────────────────────────────────────────────

const mockGet = vi.fn();
vi.mock("../../../../api/client", () => ({
  get: (...args: unknown[]) => mockGet(...args),
}));

// ── useConsoleView mock (controllable viewState) ──────────────────────────

let mockViewState = "list";

vi.mock("../../../../console/core/useConsoleView", () => ({
  useConsoleView: () => ({
    viewState: mockViewState,
    isExiting: false,
    isDetailExiting: false,
    goToDetail: vi.fn(),
    goToExpanded: vi.fn(),
    collapseFromExpanded: vi.fn(),
    closeAll: vi.fn(),
    updateViewState: vi.fn(),
  }),
}));

// ── ConsoleProvider mock (passthrough) ────────────────────────────────────

vi.mock("../../../../console/core/ConsoleProvider", () => ({
  useConsole: () => ({
    viewState: "list",
    setViewState: vi.fn(),
  }),
  ConsoleProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

// ── Heavy component mocks ────────────────────────────────────────────────

vi.mock("../../../../components/ReferenceBadge", () => ({
  default: makeMockReferenceBadge({ clickable: true }),
}));

vi.mock("../../workspace/LimsDetailCard", () => ({
  default: ({ entity }: { entity: EntityListItem }) => (
    <div data-testid="lims-detail-card">Detail for {entity.display_id}</div>
  ),
}));

vi.mock("../../workspace/EntityWorkspace", () => ({
  default: ({ entity }: { entity: EntityListItem }) => (
    <div data-testid="entity-workspace">
      Workspace for {entity.display_id}
    </div>
  ),
}));

// ── Test data fixtures ────────────────────────────────────────────────────

const emptyResponse = emptyPage<EntityListItem>();

const twoEntities = [
  makeEntityListItem({ id: 1, entity_type_name: "Blood" }),
  makeEntityListItem({
    id: 2,
    display_id: "BLOOD2",
    name: "Sample B",
    entity_type_name: "Blood",
    source_entry: 5,
    source_entry_display_id: "E5",
    created_at: "2025-01-02T00:00:00Z",
  }),
];

const populatedResponse = makeEntityPage(twoEntities);

const paginatedResponse: PaginatedResponse<EntityListItem> = {
  count: 3,
  next: "/api/lims/entities/?search=&type=&offset=2",
  previous: null,
  results: [...twoEntities],
};

const secondPageResponse = makeEntityPage([
  makeEntityListItem({
    id: 3,
    display_id: "BLOOD3",
    name: "Sample C",
    entity_type_name: "Blood",
    created_at: "2025-01-03T00:00:00Z",
  }),
]);

// ── Render helper ─────────────────────────────────────────────────────────

function renderLims(initialRoute = "/lims") {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <LimsConsole />
    </MemoryRouter>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("LimsConsole", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockViewState = "list";
  });

  // ── Loading / empty / error states ──────────────────────────────────

  it("shows loading state initially", () => {
    mockGet.mockReturnValue(new Promise(() => {})); // never resolves
    renderLims();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows empty state when no entities", async () => {
    mockGet.mockResolvedValue(emptyResponse);
    renderLims();
    await waitFor(() => {
      expect(screen.getByText("No entities found.")).toBeInTheDocument();
    });
  });

  it("shows error state with error message", async () => {
    mockGet.mockRejectedValue(new Error("Network error"));
    renderLims();
    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  // ── Entity rendering ────────────────────────────────────────────────

  it("renders entities from API", async () => {
    mockGet.mockResolvedValue(populatedResponse);
    renderLims();
    await waitFor(() => {
      expect(screen.getByText("Sample A")).toBeInTheDocument();
    });
    expect(screen.getByText("Sample B")).toBeInTheDocument();
    expect(screen.getAllByText("Blood").length).toBeGreaterThanOrEqual(1);
  });

  it("renders entity type icons", async () => {
    mockGet.mockResolvedValue(populatedResponse);
    renderLims();
    await waitFor(() => {
      const badges = screen.getAllByTestId("ref-badge");
      expect(badges.length).toBeGreaterThanOrEqual(1);
    });
    const iconBadge = screen.getAllByTestId("ref-badge")[0];
    expect(iconBadge).toHaveAttribute("data-display-id", "BLOOD1");
  });

  it("renders source entry ReferenceBadge when source exists", async () => {
    mockGet.mockResolvedValue(populatedResponse);
    renderLims();
    await waitFor(() => {
      expect(screen.getByText("Sample B")).toBeInTheDocument();
    });
    // Entity BLOOD2 has source_entry_display_id "E5"
    const sourceBadges = screen.getAllByTestId("ref-badge");
    const sourceBadge = sourceBadges.find(
      (b) => b.getAttribute("data-display-id") === "E5",
    );
    expect(sourceBadge).toBeTruthy();
  });

  it("renders source entry ReferenceBadge as clickable", async () => {
    mockGet.mockResolvedValue(populatedResponse);
    renderLims();
    await waitFor(() => {
      expect(screen.getByText("Sample B")).toBeInTheDocument();
    });
    const sourceBadges = screen.getAllByTestId("ref-badge");
    const sourceBadge = sourceBadges.find(
      (b) => b.getAttribute("data-display-id") === "E5",
    );
    expect(sourceBadge).toBeTruthy();
    expect(sourceBadge!.getAttribute("data-clickable")).toBe("true");
  });

  it("renders dash for missing source entry", async () => {
    mockGet.mockResolvedValue(populatedResponse);
    renderLims();
    await waitFor(() => {
      expect(screen.getByText("Sample A")).toBeInTheDocument();
    });
    // Entity BLOOD1 has no source_entry_display_id → dash
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  // ── URL param passing ───────────────────────────────────────────────

  it("passes type filter from URL to API", async () => {
    mockGet.mockResolvedValue(emptyResponse);
    renderLims("/lims?type=5");
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining("type=5"),
      );
    });
  });

  // ── Row selection ───────────────────────────────────────────────────

  it("highlights selected row on click", async () => {
    mockGet.mockResolvedValue(populatedResponse);
    renderLims();
    await waitFor(() => {
      expect(screen.getByText("Sample A")).toBeInTheDocument();
    });
    const row = screen.getByText("Sample A").closest("tr")!;
    fireEvent.click(row);
    expect(row.className).toContain("is-selected");
  });

  it("deselects on second click (toggle back to list)", async () => {
    // Start in "detail" state so the toggle logic activates
    mockViewState = "detail";
    mockGet.mockResolvedValue(populatedResponse);
    renderLims();
    await waitFor(() => {
      expect(screen.getByText("Sample A")).toBeInTheDocument();
    });
    const row = screen.getByText("Sample A").closest("tr")!;
    // First click in detail state: selects the row
    fireEvent.click(row);
    expect(row.className).toContain("is-selected");
    // Second click in detail state on same row: toggles back to list (deselects)
    fireEvent.click(row);
    expect(row.className).not.toContain("is-selected");
  });

  // ── Expand / navigation ─────────────────────────────────────────────

  it("renders expand button for each entity row", async () => {
    mockGet.mockResolvedValue(populatedResponse);
    renderLims();
    await waitFor(() => {
      expect(screen.getByText("Sample A")).toBeInTheDocument();
    });
    const expandBtns = screen.getAllByTitle("Expand to full detail");
    expect(expandBtns.length).toBe(2);
    // Clicking expand button should not crash
    fireEvent.click(expandBtns[0]);
    // Expand button navigation changes the URL without error
  });

  it("expand button click stops propagation to row handler", async () => {
    mockGet.mockResolvedValue(populatedResponse);
    renderLims();
    await waitFor(() => {
      expect(screen.getByText("Sample A")).toBeInTheDocument();
    });
    const row = screen.getByText("Sample A").closest("tr")!;
    const expandBtn = row.querySelector(
      ".console-master-row-expand-btn",
    ) as HTMLElement;
    fireEvent.click(expandBtn);
    // Row should NOT get is-selected since expand stops propagation
    expect(row.className).not.toContain("is-selected");
  });

  // ── Load More pagination ────────────────────────────────────────────

  it("shows Load More button when more pages exist", async () => {
    mockGet.mockResolvedValue(paginatedResponse);
    renderLims();
    await waitFor(() => {
      expect(screen.getByText("Sample A")).toBeInTheDocument();
    });
    expect(screen.getByText("Load More")).toBeInTheDocument();
  });

  it("Load More fetches next page and appends rows", async () => {
    mockGet
      .mockResolvedValueOnce(paginatedResponse)
      .mockResolvedValueOnce(secondPageResponse);
    renderLims();
    await waitFor(() => {
      expect(screen.getByText("Sample A")).toBeInTheDocument();
    });
    const loadMoreBtn = screen.getByText("Load More");
    fireEvent.click(loadMoreBtn);
    await waitFor(() => {
      expect(screen.getByText("Sample C")).toBeInTheDocument();
    });
    expect(mockGet).toHaveBeenCalledTimes(2);
    // Second call should use the next URL (without /api prefix — the component strips it)
    expect(mockGet).toHaveBeenLastCalledWith(
      "/lims/entities/?search=&type=&offset=2",
    );
  });

  // ── Expanded state behavior ─────────────────────────────────────────

  it("row click does nothing in expanded viewState", async () => {
    mockViewState = "expanded";
    mockGet.mockResolvedValue(populatedResponse);
    renderLims();
    await waitFor(() => {
      expect(screen.getByText("Sample A")).toBeInTheDocument();
    });
    const row = screen.getByText("Sample A").closest("tr")!;
    fireEvent.click(row);
    // Row should NOT become selected when in expanded state
    expect(row.className).not.toContain("is-selected");
  });
});
