import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import TagSettings from "../TagSettings";

const mockListTags = vi.fn();
const mockCreateTag = vi.fn();
const mockUpdateTag = vi.fn();
const mockDeleteTag = vi.fn();

vi.mock("../../api", () => ({
  listTags: (...args: unknown[]) => mockListTags(...args),
  createTag: (...args: unknown[]) => mockCreateTag(...args),
  updateTag: (...args: unknown[]) => mockUpdateTag(...args),
  deleteTag: (...args: unknown[]) => mockDeleteTag(...args),
}));

function makeTag(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: "Urgent",
    color: "muted",
    icon: "circle",
    ...overrides,
  };
}

describe("TagSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Loading & empty states ──────────────────────────────────────────

  it("shows loading state initially", () => {
    mockListTags.mockReturnValue(new Promise(() => {}));
    render(<TagSettings />);
    expect(screen.getByText("Loading tags…")).toBeInTheDocument();
  });

  it("renders empty state in master list when no tags exist", async () => {
    mockListTags.mockResolvedValue([]);
    render(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByText("No tags found.")).toBeInTheDocument();
    });
  });

  it("shows error state on API failure", async () => {
    mockListTags.mockRejectedValue(new Error("Network error"));
    render(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  // ── Hero header ─────────────────────────────────────────────────────

  it("renders hero header with eyebrow, title, and description", async () => {
    mockListTags.mockResolvedValue([]);
    render(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByText("labelling")).toBeInTheDocument();
    });
    expect(screen.getByText("Labelling")).toBeInTheDocument();
    expect(screen.getByText(/Create and manage tags/)).toBeInTheDocument();
  });

  it("renders '+ New Tag' button in header actions", async () => {
    mockListTags.mockResolvedValue([]);
    render(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByText("+ New Tag")).toBeInTheDocument();
    });
  });

  it("toggles new tag create form when '+ New Tag' is clicked", async () => {
    mockListTags.mockResolvedValue([]);
    render(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByText("+ New Tag")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("+ New Tag"));
    expect(screen.getByPlaceholderText("e.g., Urgent")).toBeInTheDocument();
    const cancelButtons = screen.getAllByText("Cancel");
    fireEvent.click(cancelButtons[1]);
    expect(screen.queryByPlaceholderText("e.g., Urgent")).not.toBeInTheDocument();
  });

  it("replaces '+ New Tag' with 'Cancel' in header while create form is open", async () => {
    mockListTags.mockResolvedValue([]);
    render(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByText("+ New Tag")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("+ New Tag"));
    expect(screen.queryByText("+ New Tag")).not.toBeInTheDocument();
    const cancelButtons = screen.getAllByText("Cancel");
    expect(cancelButtons).toHaveLength(2);
  });

  // ── Master list ─────────────────────────────────────────────────────

  it("renders tags in the master list", async () => {
    mockListTags.mockResolvedValue([
      makeTag({ id: 1, name: "Urgent", color: "red", icon: "dna" }),
      makeTag({ id: 2, name: "Review", color: "blue", icon: "leaf" }),
    ]);
    render(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByText("Urgent")).toBeInTheDocument();
    });
    expect(screen.getByText("Review")).toBeInTheDocument();
  });

  it("filters tags by name in master list", async () => {
    mockListTags.mockResolvedValue([
      makeTag({ id: 1, name: "Urgent" }),
      makeTag({ id: 2, name: "Review" }),
    ]);
    render(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByText("Urgent")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText("Filter tags"), {
      target: { value: "Urg" },
    });
    expect(screen.getByText("Urgent")).toBeInTheDocument();
    expect(screen.queryByText("Review")).not.toBeInTheDocument();
  });

  it("selects a tag and shows its detail pane", async () => {
    mockListTags.mockResolvedValue([
      makeTag({ id: 1, name: "Urgent", color: "warn", icon: "rat" }),
    ]);
    render(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByText("Urgent")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Urgent"));
    expect(screen.getByText("Tag identity")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Tag name")).toBeInTheDocument();
  });

  it("deselects tag when clicking the same row", async () => {
    mockListTags.mockResolvedValue([
      makeTag({ id: 1, name: "Urgent" }),
    ]);
    render(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByText("Urgent")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Urgent"));
    expect(screen.getByText("Tag identity")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Urgent"));
    expect(screen.queryByText("Tag identity")).not.toBeInTheDocument();
  });

  // ── Detail pane ─────────────────────────────────────────────────────

  it("shows prompt to select a tag when none is selected", async () => {
    mockListTags.mockResolvedValue([
      makeTag({ id: 1, name: "Urgent" }),
    ]);
    render(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByText("Urgent")).toBeInTheDocument();
    });
    expect(
      screen.getByText("Select a tag from the list to view or edit its details."),
    ).toBeInTheDocument();
  });

  it("shows tag properties in detail pane", async () => {
    mockListTags.mockResolvedValue([
      makeTag({ id: 1, name: "Urgent", color: "warn", icon: "rat" }),
    ]);
    render(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByText("Urgent")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Urgent"));
    expect(screen.getByText("Tag identity")).toBeInTheDocument();
    expect(screen.getByText("#1")).toBeInTheDocument();
  });

  it("edits tag name via detail pane and shows save bar", async () => {
    mockListTags.mockResolvedValue([
      makeTag({ id: 1, name: "Urgent" }),
    ]);
    render(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByText("Urgent")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Urgent"));
    const nameInput = screen.getByPlaceholderText("Tag name");
    fireEvent.change(nameInput, { target: { value: "Updated" } });
    expect(nameInput).toHaveValue("Updated");
    await waitFor(() => {
      expect(screen.getByText(/1 tag with unsaved changes/)).toBeInTheDocument();
    });
  });

  it("saves all dirty edits when save is clicked", async () => {
    mockListTags.mockResolvedValue([
      makeTag({ id: 1, name: "Urgent", color: "warn", icon: "rat" }),
    ]);
    mockUpdateTag.mockResolvedValue({});
    render(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByText("Urgent")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Urgent"));
    const nameInput = screen.getByPlaceholderText("Tag name");
    fireEvent.change(nameInput, { target: { value: "Updated" } });
    await waitFor(() => {
      expect(screen.getByText(/Save Changes/)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(/Save Changes/));
    await waitFor(() => {
      expect(mockUpdateTag).toHaveBeenCalledWith(1, {
        color: "warn",
        icon: "rat",
      });
    });
  });

  it("discards all edits when discard is clicked", async () => {
    mockListTags.mockResolvedValue([
      makeTag({ id: 1, name: "Urgent" }),
    ]);
    render(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByText("Urgent")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Urgent"));
    const nameInput = screen.getByPlaceholderText("Tag name");
    fireEvent.change(nameInput, { target: { value: "Updated" } });
    await waitFor(() => {
      expect(screen.getByText(/1 tag with unsaved changes/)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Discard Changes"));
    expect(screen.queryByText(/unsaved changes/)).not.toBeInTheDocument();
  });

  it("closes detail pane via close button", async () => {
    mockListTags.mockResolvedValue([
      makeTag({ id: 1, name: "Urgent" }),
    ]);
    render(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByText("Urgent")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Urgent"));
    expect(screen.getByText("Tag identity")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Close detail"));
    expect(screen.queryByText("Tag identity")).not.toBeInTheDocument();
  });

  // ── Create tag ───────────────────────────────────────────────────────

  it("creates a tag via the new tag form", async () => {
    mockListTags.mockResolvedValue([]);
    mockCreateTag.mockResolvedValue({});
    render(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByText("+ New Tag")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("+ New Tag"));
    fireEvent.change(screen.getByPlaceholderText("e.g., Urgent"), {
      target: { value: "Urgent" },
    });
    fireEvent.click(screen.getByText("Create"));
    await waitFor(() => {
      expect(mockCreateTag).toHaveBeenCalledWith("Urgent", "muted", "circle");
    });
  });

  it("does not allow creating a tag with empty name", async () => {
    mockListTags.mockResolvedValue([]);
    render(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByText("+ New Tag")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("+ New Tag"));
    const createButton = screen.getByText("Create");
    expect(createButton).toBeDisabled();
  });

  it("shows error when tag creation fails", async () => {
    mockListTags.mockResolvedValue([]);
    mockCreateTag.mockRejectedValue(new Error("Duplicate name"));
    render(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByText("+ New Tag")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("+ New Tag"));
    fireEvent.change(screen.getByPlaceholderText("e.g., Urgent"), {
      target: { value: "Urgent" },
    });
    fireEvent.click(screen.getByText("Create"));
    await waitFor(() => {
      expect(screen.getByText("Duplicate name")).toBeInTheDocument();
    });
  });

  // ── Delete tag ───────────────────────────────────────────────────────

  it("deletes a tag after confirmation via detail pane", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    mockListTags.mockResolvedValue([makeTag({ id: 1, name: "Urgent" })]);
    mockDeleteTag.mockResolvedValue(undefined);
    render(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByText("Urgent")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Urgent"));
    fireEvent.click(screen.getByTitle("Delete tag"));
    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => {
      expect(mockDeleteTag).toHaveBeenCalledWith(1);
    });
    confirmSpy.mockRestore();
  });

  it("does not delete tag when confirmation is cancelled", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    mockListTags.mockResolvedValue([makeTag({ id: 1, name: "Urgent" })]);
    render(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByText("Urgent")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Urgent"));
    fireEvent.click(screen.getByTitle("Delete tag"));
    expect(confirmSpy).toHaveBeenCalled();
    expect(mockDeleteTag).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
