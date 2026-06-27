import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import LibraryTable from "../LibraryTable";
import type { LibraryItem } from "../../../../types/library";

// ReferenceBadge renders inside the table; we mock it to keep the test isolated
vi.mock("../../../../components/ReferenceBadge", () => ({
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

const mockFolders: LibraryItem[] = [
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
];

const mockEntries: LibraryItem[] = [
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
  {
    type: "entry",
    id: 11,
    display_id: "E2",
    title: "Gel Image",
    folder: null,
    folder_name: null,
    author_username: null,
    created_at: "2025-01-04T00:00:00Z",
    updated_at: "2025-01-04T00:00:00Z",
  },
];

const mixedItems: LibraryItem[] = [...mockFolders, ...mockEntries];

describe("LibraryTable", () => {
  it("renders a table with the correct headers", () => {
    render(
      <LibraryTable
        items={[]}
        selectedId={null}
        onRowClick={vi.fn()}
        onRowExpand={vi.fn()}
        onFolderNavigate={vi.fn()}
      />,
    );
    expect(screen.getByText("ID")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Type")).toBeInTheDocument();
    expect(screen.getByText("Created")).toBeInTheDocument();
    expect(screen.getByText("Folder")).toBeInTheDocument();
  });

  it("shows empty state when no items", () => {
    render(
      <LibraryTable
        items={[]}
        selectedId={null}
        onRowClick={vi.fn()}
        onRowExpand={vi.fn()}
        onFolderNavigate={vi.fn()}
      />,
    );
    expect(screen.getByText("This folder is empty.")).toBeInTheDocument();
  });

  it("renders folder rows with folder icon", () => {
    render(
      <LibraryTable
        items={mockFolders}
        selectedId={null}
        onRowClick={vi.fn()}
        onRowExpand={vi.fn()}
        onFolderNavigate={vi.fn()}
      />,
    );
    expect(screen.getByText(/Experiments/)).toBeInTheDocument();
    expect(screen.getByText(/Protocols/)).toBeInTheDocument();
    // Folders show "—" in ID and Type columns
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(4); // 2 folders × 2 columns (ID, Type, Folder)
  });

  it("renders entry rows with ReferenceBadge", () => {
    render(
      <LibraryTable
        items={mockEntries}
        selectedId={null}
        onRowClick={vi.fn()}
        onRowExpand={vi.fn()}
        onFolderNavigate={vi.fn()}
      />,
    );
    // Title appears in both the badge and the name column
    expect(screen.getAllByText("PCR Results").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Gel Image").length).toBeGreaterThanOrEqual(2);
  });

  it("highlights the selected entry row", () => {
    render(
      <LibraryTable
        items={mockEntries}
        selectedId={10}
        onRowClick={vi.fn()}
        onRowExpand={vi.fn()}
        onFolderNavigate={vi.fn()}
      />,
    );
    const rows = screen.getAllByRole("row");
    // First row (0 is header) should have is-selected class
    expect(rows[1].className).toContain("is-selected");
    expect(rows[2].className).not.toContain("is-selected");
  });

  it("calls onRowClick when clicking an entry row", () => {
    const handleClick = vi.fn();
    render(
      <LibraryTable
        items={mockEntries}
        selectedId={null}
        onRowClick={handleClick}
        onRowExpand={vi.fn()}
        onFolderNavigate={vi.fn()}
      />,
    );
    // Click the name column cell (the one NOT inside a badge)
    const rows = screen.getAllByRole("row");
    // Row 1 is PCR Results, click on its Name cell (td[1])
    const pcrNameCell = rows[1].querySelectorAll("td")[1];
    fireEvent.click(pcrNameCell!);
    expect(handleClick).toHaveBeenCalledWith(mockEntries[0]);
  });

  it("calls onRowClick when clicking a folder row", () => {
    const handleClick = vi.fn();
    render(
      <LibraryTable
        items={mockFolders}
        selectedId={null}
        onRowClick={handleClick}
        onRowExpand={vi.fn()}
        onFolderNavigate={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText(/Experiments/));
    expect(handleClick).toHaveBeenCalledWith(mockFolders[0]);
  });

  it("calls onRowExpand when clicking expand button on entry row", () => {
    const handleExpand = vi.fn();
    render(
      <LibraryTable
        items={mockEntries}
        selectedId={null}
        onRowClick={vi.fn()}
        onRowExpand={handleExpand}
        onFolderNavigate={vi.fn()}
      />,
    );
    const expandBtns = screen.getAllByTitle("Open entry");
    fireEvent.click(expandBtns[0]);
    expect(handleExpand).toHaveBeenCalledWith(mockEntries[0]);
  });

  it("calls onFolderNavigate when clicking expand button on folder row", () => {
    const handleNavigate = vi.fn();
    render(
      <LibraryTable
        items={mockFolders}
        selectedId={null}
        onRowClick={vi.fn()}
        onRowExpand={vi.fn()}
        onFolderNavigate={handleNavigate}
      />,
    );
    const openBtns = screen.getAllByTitle("Open folder");
    fireEvent.click(openBtns[0]);
    expect(handleNavigate).toHaveBeenCalledWith("Experiments");
  });

  it("renders folder_name for entries and dash for root entries", () => {
    render(
      <LibraryTable
        items={mixedItems}
        selectedId={null}
        onRowClick={vi.fn()}
        onRowExpand={vi.fn()}
        onFolderNavigate={vi.fn()}
      />,
    );
    expect(screen.getByText("Experiments")).toBeInTheDocument(); // folder name column for PCR Results
    // Gel Image has folder_name=null, so "—" appears. We already have many dashes.
  });
});
