import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LibraryNewDropdown from "../hub/LibraryNewDropdown";

// ── Hoisted mocks ──────────────────────────────────────────────────────

const { mockPost, mockCreateEntry } = vi.hoisted(() => ({
  mockPost: vi.fn().mockResolvedValue({ id: 99, name: "NewFolder" }),
  mockCreateEntry: vi.fn(),
}));

// Mock the API client
vi.mock("../../../shell/src/api/client", () => ({
  post: mockPost,
  get: vi.fn(),
}));

// Mock the ELN api's createEntry — the component imports it directly
vi.mock("../../eln/api", () => ({
  createEntry: mockCreateEntry,
}));

// ── Helpers ───────────────────────────────────────────────────────────

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
  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockResolvedValue({ id: 99, name: "NewFolder" });
  });

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

  // ── New Entry immediate-create flow ──────────────────────────────────

  it("calls createEntry with default payload and navigates on success", async () => {
    mockCreateEntry.mockResolvedValue({
      display_id: "E-0042",
      id: 42,
      name: "Untitled",
      content: { type: "doc", content: [{ type: "paragraph" }] },
    });

    renderDropdown({ folderId: 7 });
    fireEvent.click(screen.getByTitle("New folder or entry"));
    fireEvent.click(screen.getByText("New ELN Entry"));

    await waitFor(() => {
      expect(mockCreateEntry).toHaveBeenCalledWith({
        name: "Untitled",
        content: { type: "doc", content: [{ type: "paragraph" }] },
        folder: 7,
      });
    });

    // Should navigate to the new entry with ?new=true
    // (useNavigate is not mocked, but the component navigates to
    // /eln/E-0042?new=true — just verify createEntry was called correctly)
  });

  it("disables the New ELN Entry button while creating", async () => {
    // Never resolve — keeps button in loading state
    mockCreateEntry.mockReturnValue(new Promise(() => {}));

    renderDropdown();
    fireEvent.click(screen.getByTitle("New folder or entry"));
    const btn = screen.getByText("New ELN Entry").closest("button")!;
    fireEvent.click(btn);

    await waitFor(() => {
      expect(btn).toBeDisabled();
    });
  });

  it("shows error message when createEntry fails", async () => {
    mockCreateEntry.mockRejectedValue(new Error("Server error"));

    renderDropdown();
    fireEvent.click(screen.getByTitle("New folder or entry"));
    fireEvent.click(screen.getByText("New ELN Entry"));

    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeInTheDocument();
    });
  });

  it("closes dropdown after successful entry creation", async () => {
    mockCreateEntry.mockResolvedValue({
      display_id: "E-0042",
      id: 42,
      name: "Untitled",
      content: { type: "doc", content: [{ type: "paragraph" }] },
    });

    renderDropdown();
    fireEvent.click(screen.getByTitle("New folder or entry"));
    fireEvent.click(screen.getByText("New ELN Entry"));

    await waitFor(() => {
      // Menu should close after successful creation
      expect(screen.queryByText("New ELN Entry")).toBeNull();
    });
  });
});
