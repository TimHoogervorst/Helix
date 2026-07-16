import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import ElnLibraryCard from "../library/ElnLibraryCard";

const FULL_ITEM: Record<string, unknown> = {
  type: "entry",
  id: 42,
  display_id: "EXP-0284",
  title: "gRNA screen v3",
  folder: 7,
  folder_name: "Screens",
  author_username: "m.kato",
  author_info: {
    id: 2,
    username: "m.kato",
    first_name: "Mika",
    last_name: "Kato",
    color: "#4A90D9",
  },
  status: "in_progress",
  description: "First paragraph of content…",
  tags: [{ name: "CRISPR", color: "flask", icon: "circle" }],
  editors: [],
  samples_count: null,
  attachments_count: null,
  property_fields: {},
  created_at: "2025-06-01T00:00:00Z",
  updated_at: "2025-07-01T12:00:00Z",
};

describe("ElnLibraryCard", () => {
  // ── View mode stability ─────────────────────────────────────────────────

  it("renders nothing in list view", () => {
    const { container } = render(
      <ElnLibraryCard item={FULL_ITEM} viewMode="list" isSelected={false} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing in grid view", () => {
    const { container } = render(
      <ElnLibraryCard item={FULL_ITEM} viewMode="grid" isSelected={false} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing in compact view", () => {
    const { container } = render(
      <ElnLibraryCard
        item={FULL_ITEM}
        viewMode="compact"
        isSelected={false}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  // ── Selection state ─────────────────────────────────────────────────────

  it("renders nothing when selected", () => {
    const { container } = render(
      <ElnLibraryCard item={FULL_ITEM} viewMode="list" isSelected={true} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when not selected", () => {
    const { container } = render(
      <ElnLibraryCard item={FULL_ITEM} viewMode="list" isSelected={false} />,
    );
    expect(container.innerHTML).toBe("");
  });

  // ── Item data tolerance ─────────────────────────────────────────────────

  it("handles empty item object without crashing", () => {
    const { container } = render(
      <ElnLibraryCard item={{}} viewMode="list" isSelected={false} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("handles item with only partial data without crashing", () => {
    const { container } = render(
      <ElnLibraryCard
        item={{ id: 1, title: "Test" }}
        viewMode="grid"
        isSelected={false}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("handles item with undefined values without crashing", () => {
    const { container } = render(
      <ElnLibraryCard
        item={{
          type: "entry",
          id: 99,
          display_id: null,
          title: undefined,
          folder: null,
        }}
        viewMode="compact"
        isSelected={true}
      />,
    );
    expect(container.innerHTML).toBe("");
  });
});
