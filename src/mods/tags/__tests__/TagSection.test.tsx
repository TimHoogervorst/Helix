import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TagSection } from "../ui/TagSection";
import type { Tag } from "../types";

vi.mock("../hooks/useTagSearch", () => ({
  useTagSearch: () => ({
    query: "",
    setQuery: vi.fn(),
    suggestions: [],
    isSearching: false,
    isCreating: false,
    pendingName: null,
    pendingColor: "muted",
    pendingIcon: "circle",
    startCreate: vi.fn(),
    pickColor: vi.fn(),
    pickIcon: vi.fn(),
    cancelCreate: vi.fn(),
    clearSearch: vi.fn(),
  }),
}));

function makeTag(overrides: Partial<Tag> = {}): Tag {
  return { id: 1, name: "CRISPR", color: "enzyme", icon: "dna", ...overrides };
}

describe("TagSection", () => {
  it("renders nothing when there are no tags and no callbacks", () => {
    const { container } = render(<TagSection tags={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders tag pills and autocomplete for an editor", () => {
    render(
      <TagSection
        tags={[makeTag()]}
        onAddTag={vi.fn()}
        onRemoveTag={vi.fn()}
      />,
    );

    expect(screen.getByText("CRISPR")).toBeInTheDocument();
    expect(screen.getByTestId("tag-autocomplete")).toBeInTheDocument();
    expect(screen.getByLabelText("Remove tag CRISPR")).toBeInTheDocument();
  });

  it("renders read-only pills without autocomplete when callbacks are omitted", () => {
    render(<TagSection tags={[makeTag()]} />);

    expect(screen.getByText("CRISPR")).toBeInTheDocument();
    expect(screen.queryByTestId("tag-autocomplete")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Remove tag CRISPR")).not.toBeInTheDocument();
  });

  it("passes the remove callback to tag pills", () => {
    const onRemoveTag = vi.fn();
    render(<TagSection tags={[makeTag({ id: 7 })]} onRemoveTag={onRemoveTag} />);

    fireEvent.click(screen.getByLabelText("Remove tag CRISPR"));

    expect(onRemoveTag).toHaveBeenCalledWith(7);
  });
});
