import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LibraryNewDropdown from "../LibraryNewDropdown";

// Mock the API client
vi.mock("../../../../api/client", () => ({
  post: vi.fn().mockResolvedValue({ id: 99, name: "NewFolder" }),
  get: vi.fn(),
}));

function renderDropdown(props?: Partial<{ path: string; folderId: number | null; onCreated: () => void }>) {
  return render(
    <MemoryRouter>
      <LibraryNewDropdown
        currentPath={props?.path ?? ""}
        currentFolderId={props?.folderId ?? null}
        onCreated={props?.onCreated ?? vi.fn()}
      />
    </MemoryRouter>,
  );
}

describe("LibraryNewDropdown", () => {
  it("renders the + button", () => {
    renderDropdown();
    expect(screen.getByTitle("New folder or entry")).toBeInTheDocument();
  });

  it("opens menu on + click", () => {
    renderDropdown();
    fireEvent.click(screen.getByTitle("New folder or entry"));
    expect(screen.getByText("New Folder")).toBeInTheDocument();
    expect(screen.getByText("New ELN Entry")).toBeInTheDocument();
  });

  it("shows folder input when New Folder is clicked", () => {
    renderDropdown();
    fireEvent.click(screen.getByTitle("New folder or entry"));
    fireEvent.click(screen.getByText("New Folder"));
    expect(screen.getByPlaceholderText("Folder name…")).toBeInTheDocument();
  });

  it("cancels folder creation on Escape", () => {
    renderDropdown();
    fireEvent.click(screen.getByTitle("New folder or entry"));
    fireEvent.click(screen.getByText("New Folder"));
    const input = screen.getByPlaceholderText("Folder name…");
    fireEvent.keyDown(input, { key: "Escape" });
    // Should go back to menu
    expect(screen.getByText("New Folder")).toBeInTheDocument();
    expect(screen.getByText("New ELN Entry")).toBeInTheDocument();
  });
});
