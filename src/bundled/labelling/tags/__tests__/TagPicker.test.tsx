/**
 * Tests for TagPicker — dropdown for selecting existing tags.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TagPicker } from "../ui/TagPicker";
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

describe("TagPicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListTags.mockReset();
    mockCreateTag.mockReset();
    mockListTags.mockResolvedValue([]);
  });

  // ── Rendering ────────────────────────────────────────────────────────────

  it("renders selected tags as TagPills", () => {
    const selected = [
      makeTag({ id: 1, name: "CRISPR" }),
      makeTag({ id: 2, name: "qPCR" }),
    ];
    render(
      <TagPicker
        selectedTags={selected}
        onTagSelect={() => {}}
        onTagRemove={() => {}}
      />,
    );

    expect(screen.getByText("CRISPR")).toBeInTheDocument();
    expect(screen.getByText("qPCR")).toBeInTheDocument();
  });

  it("renders search input with placeholder", () => {
    render(
      <TagPicker
        selectedTags={[]}
        onTagSelect={() => {}}
        onTagRemove={() => {}}
        placeholder="Filter tags…"
      />,
    );

    expect(screen.getByPlaceholderText("Filter tags…")).toBeInTheDocument();
  });

  it("removes a selected tag when remove button is clicked", () => {
    const onTagRemove = vi.fn();
    const selected = [makeTag({ id: 1, name: "CRISPR" })];

    render(
      <TagPicker
        selectedTags={selected}
        onTagSelect={() => {}}
        onTagRemove={onTagRemove}
      />,
    );

    fireEvent.click(screen.getByLabelText("Remove tag CRISPR"));
    expect(onTagRemove).toHaveBeenCalledWith(1);
  });

  // ── Dropdown ─────────────────────────────────────────────────────────────

  it("opens dropdown on focus and shows suggestions", async () => {
    const results = [makeTag({ id: 1, name: "CRISPR" })];
    mockListTags.mockResolvedValue(results);

    render(
      <TagPicker
        selectedTags={[]}
        onTagSelect={() => {}}
        onTagRemove={() => {}}
      />,
    );

    const input = screen.getByTestId("tag-picker-input");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "CR" } });

    await waitFor(() => {
      expect(screen.getByTestId("tag-picker-dropdown")).toBeInTheDocument();
      expect(screen.getByText("CRISPR")).toBeInTheDocument();
    });
  });

  it("shows 'No matching tags' when suggestions are empty", async () => {
    mockListTags.mockResolvedValue([]);

    render(
      <TagPicker
        selectedTags={[]}
        onTagSelect={() => {}}
        onTagRemove={() => {}}
      />,
    );

    const input = screen.getByTestId("tag-picker-input");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "xyz" } });

    await waitFor(() => {
      expect(screen.getByText("No matching tags")).toBeInTheDocument();
    });
  });

  it("selects a tag and clears search on click", async () => {
    const onTagSelect = vi.fn();
    const results = [makeTag({ id: 1, name: "CRISPR" })];
    mockListTags.mockResolvedValue(results);

    render(
      <TagPicker
        selectedTags={[]}
        onTagSelect={onTagSelect}
        onTagRemove={() => {}}
      />,
    );

    const input = screen.getByTestId("tag-picker-input");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "CR" } });

    await waitFor(() => {
      expect(screen.getByText("CRISPR")).toBeInTheDocument();
    });

    fireEvent.mouseDown(screen.getByText("CRISPR"));
    expect(onTagSelect).toHaveBeenCalledWith(results[0]);
  });

  it("does NOT show 'Create new' option (unlike TagAutocomplete)", async () => {
    mockListTags.mockResolvedValue([]);

    render(
      <TagPicker
        selectedTags={[]}
        onTagSelect={() => {}}
        onTagRemove={() => {}}
      />,
    );

    const input = screen.getByTestId("tag-picker-input");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "NewTag" } });

    await waitFor(() => {
      expect(screen.getByText("No matching tags")).toBeInTheDocument();
    });

    // Should NOT have "Create new" text
    expect(screen.queryByText(/Create new/)).not.toBeInTheDocument();
  });

  it("closes dropdown on Escape", async () => {
    mockListTags.mockResolvedValue([makeTag({ id: 1, name: "CRISPR" })]);

    render(
      <TagPicker
        selectedTags={[]}
        onTagSelect={() => {}}
        onTagRemove={() => {}}
      />,
    );

    const input = screen.getByTestId("tag-picker-input");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "CR" } });

    await waitFor(() => {
      expect(screen.getByTestId("tag-picker-dropdown")).toBeInTheDocument();
    });

    fireEvent.keyDown(input, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByTestId("tag-picker-dropdown")).not.toBeInTheDocument();
    });
  });
});
