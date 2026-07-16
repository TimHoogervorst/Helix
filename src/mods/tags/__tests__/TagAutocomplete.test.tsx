/**
 * Tests for TagAutocomplete — dropdown with search, "Create new", and colour picker.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TagAutocomplete } from "../ui/TagAutocomplete";
import type { Tag } from "../types";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockListTags = vi.fn();
const mockCreateTag = vi.fn();

vi.mock("../api", () => ({
  listTags: (...args: unknown[]) => mockListTags(...args),
  createTag: (...args: unknown[]) => mockCreateTag(...args),
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function makeTag(overrides?: Partial<Tag>): Tag {
  return { id: 1, name: "TestTag", color: "enzyme", icon: "circle", ...overrides };
}

describe("TagAutocomplete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListTags.mockReset();
    mockCreateTag.mockReset();
    mockListTags.mockResolvedValue([]);
  });

  // ── Rendering ────────────────────────────────────────────────────────────

  it("renders search input with placeholder", () => {
    render(
      <TagAutocomplete
        attachedTagIds={[]}
        onTagSelect={() => {}}
        placeholder="Add tag…"
      />,
    );

    expect(screen.getByPlaceholderText("Add tag…")).toBeInTheDocument();
  });

  // ── Suggestions dropdown ─────────────────────────────────────────────────

  it("shows up to 2 matching suggestions", async () => {
    const results = [
      makeTag({ id: 1, name: "CRISPR" }),
      makeTag({ id: 2, name: "qPCR" }),
      makeTag({ id: 3, name: "Western" }),
    ];
    mockListTags.mockResolvedValue(results);

    render(
      <TagAutocomplete
        attachedTagIds={[]}
        onTagSelect={() => {}}
      />,
    );

    const input = screen.getByTestId("tag-autocomplete-input");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "C" } });

    await waitFor(() => {
      expect(screen.getByTestId("tag-autocomplete-dropdown")).toBeInTheDocument();
    });

    // Should show only 2 of the 3 results
    const dropdown = screen.getByTestId("tag-autocomplete-dropdown");
    const buttons = dropdown.querySelectorAll("button");
    // buttons include: 2 suggestions + possibly "Create new"
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    expect(buttons.length).toBeLessThanOrEqual(3);
  });

  it("selects an existing tag on click", async () => {
    const onTagSelect = vi.fn();
    const results = [makeTag({ id: 1, name: "CRISPR" })];
    mockListTags.mockResolvedValue(results);

    render(
      <TagAutocomplete
        attachedTagIds={[]}
        onTagSelect={onTagSelect}
      />,
    );

    const input = screen.getByTestId("tag-autocomplete-input");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "CR" } });

    await waitFor(() => {
      expect(screen.getByText("CRISPR")).toBeInTheDocument();
    });

    fireEvent.mouseDown(screen.getByText("CRISPR"));
    expect(onTagSelect).toHaveBeenCalledWith(results[0]);
  });

  // ── "Create new" flow ────────────────────────────────────────────────────

  it("shows 'Create new' row when no exact match exists", async () => {
    mockListTags.mockResolvedValue([]);

    render(
      <TagAutocomplete
        attachedTagIds={[]}
        onTagSelect={() => {}}
      />,
    );

    const input = screen.getByTestId("tag-autocomplete-input");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "NewTag" } });

    await waitFor(() => {
      expect(screen.getByText(/Create new/)).toBeInTheDocument();
    });
  });

  it("does NOT show 'Create new' when exact name match exists in suggestions", async () => {
    const results = [makeTag({ id: 1, name: "CRISPR" })];
    mockListTags.mockResolvedValue(results);

    render(
      <TagAutocomplete
        attachedTagIds={[]}
        onTagSelect={() => {}}
      />,
    );

    const input = screen.getByTestId("tag-autocomplete-input");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "CRISPR" } });

    await waitFor(() => {
      expect(screen.getByText("CRISPR")).toBeInTheDocument();
    });

    expect(screen.queryByText(/Create new/)).not.toBeInTheDocument();
  });

  it("clicking 'Create new' reveals colour picker panel", async () => {
    mockListTags.mockResolvedValue([]);

    render(
      <TagAutocomplete
        attachedTagIds={[]}
        onTagSelect={() => {}}
      />,
    );

    const input = screen.getByTestId("tag-autocomplete-input");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "NewTag" } });

    await waitFor(() => {
      expect(screen.getByText(/Create new/)).toBeInTheDocument();
    });

    fireEvent.mouseDown(screen.getByText(/Create new/));

    await waitFor(() => {
      expect(screen.getByTestId("tag-create-panel")).toBeInTheDocument();
      expect(screen.getByText(/New tag:/)).toBeInTheDocument();
    });
  });

  it("creates tag on colour click in the create panel", async () => {
    const newTag = makeTag({ id: 10, name: "NewTag", color: "enzyme", icon: "circle" });
    const onTagCreated = vi.fn();
    mockListTags.mockResolvedValue([]); // first call: search
    mockCreateTag.mockResolvedValue(newTag);
    // Second listTags call: dedup check during pickColor
    mockListTags.mockResolvedValue([]);

    render(
      <TagAutocomplete
        attachedTagIds={[]}
        onTagSelect={() => {}}
        onTagCreated={onTagCreated}
      />,
    );

    const input = screen.getByTestId("tag-autocomplete-input");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "NewTag" } });

    await waitFor(() => {
      expect(screen.getByText(/Create new/)).toBeInTheDocument();
    });

    fireEvent.mouseDown(screen.getByText(/Create new/));

    await waitFor(() => {
      expect(screen.getByTestId("tag-create-panel")).toBeInTheDocument();
    });

    // Click an enzyme color dot (Label = "Enzyme")
    // We need to wait for listTags inside pickColor to resolve
    fireEvent.click(screen.getByLabelText("Enzyme"));

    await waitFor(() => {
      expect(mockCreateTag).toHaveBeenCalledWith("NewTag", "enzyme", "circle");
      expect(onTagCreated).toHaveBeenCalledWith(newTag);
    });
  });

  it("cancels create flow on X button click", async () => {
    mockListTags.mockResolvedValue([]);

    render(
      <TagAutocomplete
        attachedTagIds={[]}
        onTagSelect={() => {}}
      />,
    );

    const input = screen.getByTestId("tag-autocomplete-input");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "NewTag" } });

    await waitFor(() => {
      expect(screen.getByText(/Create new/)).toBeInTheDocument();
    });

    fireEvent.mouseDown(screen.getByText(/Create new/));

    await waitFor(() => {
      expect(screen.getByTestId("tag-create-panel")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Cancel tag creation"));

    await waitFor(() => {
      expect(screen.queryByTestId("tag-create-panel")).not.toBeInTheDocument();
    });
  });

  it("cancels create flow on Escape", async () => {
    mockListTags.mockResolvedValue([]);

    render(
      <TagAutocomplete
        attachedTagIds={[]}
        onTagSelect={() => {}}
      />,
    );

    const input = screen.getByTestId("tag-autocomplete-input");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "NewTag" } });

    await waitFor(() => {
      expect(screen.getByText(/Create new/)).toBeInTheDocument();
    });

    fireEvent.mouseDown(screen.getByText(/Create new/));

    await waitFor(() => {
      expect(screen.getByTestId("tag-create-panel")).toBeInTheDocument();
    });

    fireEvent.keyDown(input, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByTestId("tag-create-panel")).not.toBeInTheDocument();
    });
  });

  it("filters out attached tag IDs from suggestions", async () => {
    const results = [makeTag({ id: 1, name: "CRISPR" }), makeTag({ id: 2, name: "qPCR" })];
    mockListTags.mockResolvedValue(results);

    render(
      <TagAutocomplete
        attachedTagIds={[1]} // CRISPR already attached
        onTagSelect={() => {}}
      />,
    );

    const input = screen.getByTestId("tag-autocomplete-input");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "C" } });

    await waitFor(() => {
      // Only qPCR should appear (CRISPR is filtered out)
      expect(screen.getByText("qPCR")).toBeInTheDocument();
      expect(screen.queryByText("CRISPR")).not.toBeInTheDocument();
    });
  });

  it("shows 'Create new' when all suggestions are filtered out", async () => {
    // Even when all results are already attached, the create-new option is available
    mockListTags.mockResolvedValue([makeTag({ id: 1, name: "ExactMatch" })]);

    render(
      <TagAutocomplete
        attachedTagIds={[1]} // The only result is already attached
        onTagSelect={() => {}}
      />,
    );

    const input = screen.getByTestId("tag-autocomplete-input");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "ExactMatch" } });

    await waitFor(() => {
      // "Create new" should show since no suggestions are visible
      expect(screen.getByText(/Create new/)).toBeInTheDocument();
    });
  });
});
