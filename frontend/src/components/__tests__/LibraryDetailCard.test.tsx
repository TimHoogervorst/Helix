import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LibraryDetailCard from "../LibraryDetailCard";
import type { LibraryEntryItem } from "../../types/library";

// Mock the content preview hook
vi.mock("../../hooks/useContentPreview", () => ({
  useContentPreview: () => ({
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Sample content." }],
        },
      ],
    },
    loading: false,
    error: null,
  }),
}));

// Mock ReferenceBadge
vi.mock("../ReferenceBadge", () => ({
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

// Mock ContentPreview (TipTap is heavy for jsdom)
vi.mock("../ContentPreview", () => ({
  default: ({ content }: { content: unknown }) => (
    <div data-testid="content-preview">
      {content ? "Content rendered" : "No content"}
    </div>
  ),
}));

const entry: LibraryEntryItem = {
  type: "entry",
  id: 1,
  display_id: "E123",
  title: "Test Entry",
  folder: 5,
  folder_name: "Experiments",
  author_username: "testuser",
  created_at: "2025-06-01T12:00:00Z",
  updated_at: "2025-06-02T15:30:00Z",
};

describe("LibraryDetailCard", () => {
  it("renders entry title and ReferenceBadge", () => {
    render(
      <MemoryRouter>
        <LibraryDetailCard
          entry={entry}
          viewState="detail"
          onClose={vi.fn()}
          onCollapse={vi.fn()}
        />
      </MemoryRouter>,
    );
    // The title appears in both the h2 text and the ReferenceBadge mock
    const headings = screen.getAllByText("Test Entry");
    expect(headings.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId("ref-badge")).toBeInTheDocument();
  });

  it("renders metadata fields", () => {
    render(
      <MemoryRouter>
        <LibraryDetailCard
          entry={entry}
          viewState="detail"
          onClose={vi.fn()}
          onCollapse={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("ELN Entry")).toBeInTheDocument();
    expect(screen.getByText("testuser")).toBeInTheDocument();
    expect(screen.getByText("Experiments")).toBeInTheDocument();
  });

  it("shows 'root' when folder_name is null", () => {
    const rootEntry: LibraryEntryItem = {
      ...entry,
      folder: null,
      folder_name: null,
    };
    render(
      <MemoryRouter>
        <LibraryDetailCard
          entry={rootEntry}
          viewState="detail"
          onClose={vi.fn()}
          onCollapse={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("root")).toBeInTheDocument();
  });

  it("shows open-entry link in detail view", () => {
    render(
      <MemoryRouter>
        <LibraryDetailCard
          entry={entry}
          viewState="detail"
          onClose={vi.fn()}
          onCollapse={vi.fn()}
        />
      </MemoryRouter>,
    );
    const link = screen.getByTitle("Open entry");
    expect(link).toBeInTheDocument();
    expect(link.getAttribute("href")).toBe("/eln/E123");
  });

  it("applies exit animation class when isDetailExiting is true", () => {
    render(
      <MemoryRouter>
        <LibraryDetailCard
          entry={entry}
          viewState="detail"
          onClose={vi.fn()}
          onCollapse={vi.fn()}
          isDetailExiting
        />
      </MemoryRouter>,
    );
    // The outer panel div should have the is-exiting class
    const panel = document.querySelector(".library-detail-panel");
    expect(panel).not.toBeNull();
    expect(panel!.className).toContain("is-exiting");
  });

  it("does not apply exit class when isDetailExiting is false", () => {
    render(
      <MemoryRouter>
        <LibraryDetailCard
          entry={entry}
          viewState="detail"
          onClose={vi.fn()}
          onCollapse={vi.fn()}
          isDetailExiting={false}
        />
      </MemoryRouter>,
    );
    const panel = document.querySelector(".library-detail-panel");
    expect(panel).not.toBeNull();
    expect(panel!.className).not.toContain("is-exiting");
  });

  it("has slide-in animation via library-detail-panel class", () => {
    render(
      <MemoryRouter>
        <LibraryDetailCard
          entry={entry}
          viewState="detail"
          onClose={vi.fn()}
          onCollapse={vi.fn()}
        />
      </MemoryRouter>,
    );
    const panel = document.querySelector(".library-detail-panel");
    expect(panel).not.toBeNull();
    // The panel renders with the class that includes the slide-in animation in CSS
    expect(panel!.className).toContain("library-detail-panel");
  });

  it("shows collapse button in expanded view", () => {
    render(
      <MemoryRouter>
        <LibraryDetailCard
          entry={entry}
          viewState="expanded"
          onClose={vi.fn()}
          onCollapse={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByTitle("Back to summary")).toBeInTheDocument();
  });

  it("calls onClose when × is clicked", () => {
    const handleClose = vi.fn();
    render(
      <MemoryRouter>
        <LibraryDetailCard
          entry={entry}
          viewState="detail"
          onClose={handleClose}
          onCollapse={vi.fn()}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTitle("Close"));
    expect(handleClose).toHaveBeenCalled();
  });

  it("calls onCollapse when < is clicked in expanded view", () => {
    const handleCollapse = vi.fn();
    render(
      <MemoryRouter>
        <LibraryDetailCard
          entry={entry}
          viewState="expanded"
          onClose={vi.fn()}
          onCollapse={handleCollapse}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTitle("Back to summary"));
    expect(handleCollapse).toHaveBeenCalled();
  });

  it("renders content preview", () => {
    render(
      <MemoryRouter>
        <LibraryDetailCard
          entry={entry}
          viewState="detail"
          onClose={vi.fn()}
          onCollapse={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("content-preview")).toBeInTheDocument();
  });

  it("shows dash for null author_username", () => {
    const noAuthor: LibraryEntryItem = {
      ...entry,
      author_username: null,
    };
    render(
      <MemoryRouter>
        <LibraryDetailCard
          entry={noAuthor}
          viewState="detail"
          onClose={vi.fn()}
          onCollapse={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
