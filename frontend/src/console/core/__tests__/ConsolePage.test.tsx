import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ViewState } from "../../../types/console";
import type { ConsoleViewState } from "../useConsoleView";

// ── Mock useConsoleView ──────────────────────────────────────────────
let mockViewState: ViewState = "list";
let mockCollapseFromExpanded = vi.fn();

vi.mock("../../../core/console/useConsoleView", () => ({
  useConsoleView: (): ConsoleViewState => ({
    viewState: mockViewState,
    isExiting: false,
    isDetailExiting: false,
    goToDetail: vi.fn(),
    goToExpanded: vi.fn(),
    collapseFromExpanded: mockCollapseFromExpanded,
    closeAll: vi.fn(),
    updateViewState: vi.fn(),
  }),
}));

// ── Mock useConsole (context) — ConsolePage reads viewState from here ─
vi.mock("../../../core/console/ConsoleContext", () => ({
  useConsole: () => ({
    viewState: mockViewState,
    setViewState: vi.fn(),
  }),
}));

import ConsolePage from "../ConsolePage";

beforeEach(() => {
  mockViewState = "list";
  mockCollapseFromExpanded = vi.fn();
});

describe("ConsolePage", () => {
  // ── Loading state ──────────────────────────────────────────────────
  it("renders loading placeholder when loading is true", () => {
    render(
      <ConsolePage loading table={<div>table</div>} />,
    );
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(screen.queryByText("table")).not.toBeInTheDocument();
  });

  it("renders content instead of loading when loading is false", () => {
    render(
      <ConsolePage table={<div>table content</div>} />,
    );
    expect(screen.getByText("table content")).toBeInTheDocument();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });

  // ── Header slot ────────────────────────────────────────────────────
  it("renders header slot when provided", () => {
    render(
      <ConsolePage
        header={<div data-testid="header">breadcrumbs here</div>}
        table={<div>table</div>}
      />,
    );
    expect(screen.getByTestId("header")).toBeInTheDocument();
    expect(screen.getByText("breadcrumbs here")).toBeInTheDocument();
  });

  it("wraps header content inside console-page-header container", () => {
    render(
      <ConsolePage
        header={<div data-testid="header">breadcrumbs here</div>}
        table={<div>table</div>}
      />,
    );
    const container = document.querySelector(".console-page-header");
    expect(container).toBeInTheDocument();
    expect(container?.children.length).toBe(1);
    expect(container?.children[0]).toBe(screen.getByTestId("header"));
  });

  it("renders empty header container when header is omitted", () => {
    render(<ConsolePage table={<div>table</div>} />);
    const headerContainer = document.querySelector(".console-page-header");
    expect(headerContainer).toBeInTheDocument();
    expect(headerContainer?.children.length).toBe(0);
  });

  // ── Error ──────────────────────────────────────────────────────────
  it("renders error message when provided", () => {
    render(
      <ConsolePage
        error="Something went wrong"
        table={<div>table</div>}
      />,
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("does not render error when null", () => {
    render(<ConsolePage table={<div>table</div>} error={null} />);
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
  });

  // ── Table slot ─────────────────────────────────────────────────────
  it("renders table slot in list view state", () => {
    mockViewState = "list";
    render(
      <ConsolePage table={<div data-testid="table-area">rows here</div>} />,
    );
    expect(screen.getByTestId("table-area")).toBeInTheDocument();
  });

  it("renders table slot in detail view state", () => {
    mockViewState = "detail";
    render(
      <ConsolePage table={<div data-testid="table-area">rows here</div>} />,
    );
    expect(screen.getByTestId("table-area")).toBeInTheDocument();
  });

  // ── Detail slot ────────────────────────────────────────────────────
  it("renders detail slot when provided", () => {
    render(
      <ConsolePage
        table={<div>table</div>}
        detail={<div data-testid="detail-area">detail card</div>}
      />,
    );
    expect(screen.getByTestId("detail-area")).toBeInTheDocument();
  });

  it("does not render detail slot when omitted", () => {
    render(<ConsolePage table={<div>table</div>} />);
    // Verify there's no stray detail area
    expect(screen.queryByTestId("detail-area")).not.toBeInTheDocument();
  });

  // ── Workspace slot ─────────────────────────────────────────────────
  it("renders workspace slot when provided", () => {
    render(
      <ConsolePage
        table={<div>table</div>}
        workspace={<div data-testid="workspace-area">tabs here</div>}
      />,
    );
    expect(screen.getByTestId("workspace-area")).toBeInTheDocument();
  });

  it("does not render workspace slot when omitted", () => {
    render(<ConsolePage table={<div>table</div>} />);
    expect(screen.queryByTestId("workspace-area")).not.toBeInTheDocument();
  });

  // ── Collapsed strip (expanded state) ───────────────────────────────
  it("renders collapsed strip instead of table in expanded state", () => {
    mockViewState = "expanded";
    render(
      <ConsolePage
        table={<div data-testid="table-area">table</div>}
        collapsedTitle="Back to detail"
      />,
    );
    // Table should be hidden
    expect(screen.queryByTestId("table-area")).not.toBeInTheDocument();
    // Collapsed strip expand button should be present
    const expandBtn = screen.getByTitle("Back to detail");
    expect(expandBtn).toBeInTheDocument();
  });

  it("calls collapseFromExpanded when collapsed strip is clicked", () => {
    mockViewState = "expanded";
    render(
      <ConsolePage
        table={<div>table</div>}
        collapsedTitle="Back to detail"
      />,
    );
    const expandBtn = screen.getByTitle("Back to detail");
    fireEvent.click(expandBtn);
    expect(mockCollapseFromExpanded).toHaveBeenCalledOnce();
  });

  // ── CSS classes ────────────────────────────────────────────────────
  it("applies page-level console-page class", () => {
    const { container } = render(
      <ConsolePage table={<div>table</div>} />,
    );
    // The outer-most div with `console-page` class
    expect(container.querySelector(".console-page")).toBeInTheDocument();
  });

  it("adds has-detail and is-expanded classes in expanded state", () => {
    mockViewState = "expanded";
    const { container } = render(
      <ConsolePage table={<div>table</div>} />,
    );
    const page = container.querySelector(".console-page");
    expect(page).toBeInTheDocument();
    expect(page!.classList.contains("has-detail")).toBe(true);
    expect(page!.classList.contains("is-expanded")).toBe(true);
    expect(
      container.querySelector(".console-master-detail.is-expanded"),
    ).toBeInTheDocument();
    expect(
      container.querySelector(".console-master-panel.is-collapsed"),
    ).toBeInTheDocument();
  });

  it("adds has-detail but not is-expanded in detail state", () => {
    mockViewState = "detail";
    const { container } = render(
      <ConsolePage table={<div>table</div>} />,
    );
    const page = container.querySelector(".console-page");
    expect(page!.classList.contains("has-detail")).toBe(true);
    expect(page!.classList.contains("is-expanded")).toBe(false);
  });

  it("has neither has-detail nor is-expanded in list state", () => {
    mockViewState = "list";
    const { container } = render(
      <ConsolePage table={<div>table</div>} />,
    );
    const page = container.querySelector(".console-page");
    expect(page!.classList.contains("has-detail")).toBe(false);
    expect(page!.classList.contains("is-expanded")).toBe(false);
  });

  // ── Load More ─────────────────────────────────────────────────────
  it("renders Load More button when hasMore is true", () => {
    const handleLoadMore = vi.fn();
    render(
      <ConsolePage
        table={<div>table</div>}
        hasMore
        onLoadMore={handleLoadMore}
      />,
    );
    expect(screen.getByText("Load More")).toBeInTheDocument();
  });

  it("does not render Load More when hasMore is false", () => {
    render(
      <ConsolePage table={<div>table</div>} hasMore={false} />,
    );
    expect(screen.queryByText("Load More")).not.toBeInTheDocument();
  });

  it("disables Load More button when loadingMore is true", () => {
    render(
      <ConsolePage
        table={<div>table</div>}
        hasMore
        onLoadMore={vi.fn()}
        loadingMore
      />,
    );
    const btn = screen.getByText("Loading…");
    expect(btn).toBeDisabled();
  });

  it("calls onLoadMore when Load More is clicked", () => {
    const handleLoadMore = vi.fn();
    render(
      <ConsolePage
        table={<div>table</div>}
        hasMore
        onLoadMore={handleLoadMore}
      />,
    );
    fireEvent.click(screen.getByText("Load More"));
    expect(handleLoadMore).toHaveBeenCalledOnce();
  });

  it("does not render Load More when hasMore is true but onLoadMore is missing", () => {
    render(
      <ConsolePage table={<div>table</div>} hasMore />,
    );
    expect(screen.queryByText("Load More")).not.toBeInTheDocument();
  });
});
