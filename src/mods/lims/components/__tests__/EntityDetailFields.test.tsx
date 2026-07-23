import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { EntityListItem } from "../../types";
import { makeEntityListItem, makeMockMentionBadge } from "../../../../shell/src/test/factories";
import EntityDetailFields from "../EntityDetailFields";

// Mock MentionBadge
vi.mock("../../../../shell/src/shared/components/MentionBadge", () => ({
  default: makeMockMentionBadge(),
}));

const entity: EntityListItem = makeEntityListItem({
  properties: {
    volume: 5,
    active: true,
    hemolyzed: false,
    notes: "test sample",
  },
  source_entry: 10,
  source_entry_display_id: "E42",
  author_username: "jdoe",
  created_at: "2025-06-01T12:00:00Z",
});

describe("EntityDetailFields", () => {
  it("renders Type field with name and prefix", () => {
    render(<EntityDetailFields entity={entity} />);
    expect(screen.getByText("Blood Sample (BLOOD)")).toBeInTheDocument();
  });

  it("renders Created field with formatted date", () => {
    render(<EntityDetailFields entity={entity} />);
    // The date formatting is locale-dependent, but it should contain date-like content
    const label = screen.getByText("Created");
    expect(label).toBeInTheDocument();
    // The value should be the toLocaleString of the ISO date
    const expectedDate = new Date("2025-06-01T12:00:00Z").toLocaleString();
    expect(screen.getByText(expectedDate)).toBeInTheDocument();
  });

  it("renders By field with username", () => {
    render(<EntityDetailFields entity={entity} />);
    expect(screen.getByText("jdoe")).toBeInTheDocument();
  });

  it("renders '—' fallback when username is null", () => {
    const noUser = { ...entity, author_username: null };
    render(<EntityDetailFields entity={noUser} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders Source Entry with MentionBadge when present", () => {
    render(<EntityDetailFields entity={entity} />);
    const badge = screen.getByTestId("ref-badge");
    expect(badge).toBeInTheDocument();
    expect(badge.getAttribute("data-display-id")).toBe("E42");
  });

  it("does not render Source Entry when missing", () => {
    const noSource = {
      ...entity,
      source_entry_display_id: null,
      source_entry: null,
    };
    render(<EntityDetailFields entity={noSource} />);
    expect(screen.queryByText("Source Entry")).not.toBeInTheDocument();
  });

  it("hides properties table by default", () => {
    render(<EntityDetailFields entity={entity} />);
    expect(screen.queryByText("Properties")).not.toBeInTheDocument();
  });

  it("shows properties table when showProperties is true", () => {
    render(<EntityDetailFields entity={entity} showProperties />);
    expect(screen.getByText("Properties")).toBeInTheDocument();
    expect(screen.getByText("volume")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("renders boolean properties as ✓/✗", () => {
    render(<EntityDetailFields entity={entity} showProperties />);
    expect(screen.getByText("✓")).toBeInTheDocument();
    expect(screen.getByText("✗")).toBeInTheDocument();
  });

  it("shows 'No properties defined' when properties is empty", () => {
    const emptyProps = { ...entity, properties: {} };
    render(<EntityDetailFields entity={emptyProps} showProperties />);
    expect(screen.getByText("No properties defined.")).toBeInTheDocument();
  });

  it("renders children slot between fields and properties", () => {
    render(
      <EntityDetailFields entity={entity} showProperties>
        <div data-testid="custom-child">Custom content</div>
      </EntityDetailFields>,
    );
    const child = screen.getByTestId("custom-child");
    const propsHeading = screen.getByText("Properties");
    // Children should appear before properties in DOM order
    expect(
      child.compareDocumentPosition(propsHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders field labels", () => {
    render(<EntityDetailFields entity={entity} />);
    expect(screen.getByText("Type")).toBeInTheDocument();
    expect(screen.getByText("Created")).toBeInTheDocument();
    expect(screen.getByText("By")).toBeInTheDocument();
  });
});
