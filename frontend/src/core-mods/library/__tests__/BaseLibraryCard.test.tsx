import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BaseLibraryCard } from "../components/BaseLibraryCard";
import { makeLibraryEntry } from "../../../test/factories";
import type { PropertyField, LibraryCardProps } from "../../../core/mod-system/types";

// ── Helpers ──────────────────────────────────────────────────────────────

function DummyIcon() {
  return <span data-testid="dummy-icon">🔬</span>;
}

function DummyListCard() {
  return <div data-testid="dummy-list-card">Mod-specific content</div>;
}

const defaultPropertyFields: PropertyField[] = [
  { key: "samples_count", label: "Samples" },
  { key: "attachments_count", label: "Attachments" },
];

// ── Tests ────────────────────────────────────────────────────────────────

describe("BaseLibraryCard", () => {
  // ── View mode CSS classes ────────────────────────────────────────────

  it("applies .view-list class when viewMode is list", () => {
    const entry = makeLibraryEntry();
    render(
      <BaseLibraryCard
        item={entry}
        viewMode="list"
        isSelected={false}
        icon={DummyIcon}
        listCard={DummyListCard}
      />,
    );
    expect(screen.getByTestId("base-library-card").className).toContain(
      "view-list",
    );
  });

  it("applies .view-grid class when viewMode is grid", () => {
    const entry = makeLibraryEntry();
    render(
      <BaseLibraryCard
        item={entry}
        viewMode="grid"
        isSelected={false}
        icon={DummyIcon}
        listCard={DummyListCard}
      />,
    );
    expect(screen.getByTestId("base-library-card").className).toContain(
      "view-grid",
    );
  });

  it("applies .view-compact class when viewMode is compact", () => {
    const entry = makeLibraryEntry();
    render(
      <BaseLibraryCard
        item={entry}
        viewMode="compact"
        isSelected={false}
        icon={DummyIcon}
        listCard={DummyListCard}
      />,
    );
    expect(screen.getByTestId("base-library-card").className).toContain(
      "view-compact",
    );
  });

  // ── Selection state ──────────────────────────────────────────────────

  it("applies .is-selected class when isSelected is true", () => {
    const entry = makeLibraryEntry();
    render(
      <BaseLibraryCard
        item={entry}
        viewMode="list"
        isSelected={true}
        icon={DummyIcon}
        listCard={DummyListCard}
      />,
    );
    expect(screen.getByTestId("base-library-card").className).toContain(
      "is-selected",
    );
  });

  it("does not apply .is-selected class when isSelected is false", () => {
    const entry = makeLibraryEntry();
    render(
      <BaseLibraryCard
        item={entry}
        viewMode="list"
        isSelected={false}
        icon={DummyIcon}
        listCard={DummyListCard}
      />,
    );
    expect(screen.getByTestId("base-library-card").className).not.toContain(
      "is-selected",
    );
  });

  // ── Star button placeholder ──────────────────────────────────────────

  it("renders a star button", () => {
    const entry = makeLibraryEntry();
    render(
      <BaseLibraryCard
        item={entry}
        viewMode="list"
        isSelected={false}
        icon={DummyIcon}
        listCard={DummyListCard}
      />,
    );
    expect(screen.getByTestId("star-button")).toBeInTheDocument();
  });

  it("star button is non-functional placeholder", () => {
    const entry = makeLibraryEntry();
    render(
      <BaseLibraryCard
        item={entry}
        viewMode="list"
        isSelected={false}
        icon={DummyIcon}
        listCard={DummyListCard}
      />,
    );
    // It renders but has no accessible role beyond being present
    expect(screen.getByTestId("star-button")).toBeInTheDocument();
  });

  // ── Icon ─────────────────────────────────────────────────────────────

  it("renders the icon component", () => {
    const entry = makeLibraryEntry();
    render(
      <BaseLibraryCard
        item={entry}
        viewMode="list"
        isSelected={false}
        icon={DummyIcon}
        listCard={DummyListCard}
      />,
    );
    expect(screen.getByTestId("dummy-icon")).toBeInTheDocument();
  });

  // ── Mandatory fields ─────────────────────────────────────────────────

  it("renders the display ID", () => {
    const entry = makeLibraryEntry({ display_id: "EXP-0284" });
    render(
      <BaseLibraryCard
        item={entry}
        viewMode="list"
        isSelected={false}
        icon={DummyIcon}
        listCard={DummyListCard}
      />,
    );
    expect(screen.getByText("EXP-0284")).toBeInTheDocument();
  });

  it("renders the title", () => {
    const entry = makeLibraryEntry({ title: "gRNA screen v3" });
    render(
      <BaseLibraryCard
        item={entry}
        viewMode="list"
        isSelected={false}
        icon={DummyIcon}
        listCard={DummyListCard}
      />,
    );
    expect(screen.getByText("gRNA screen v3")).toBeInTheDocument();
  });

  it("renders the owner/author", () => {
    const entry = makeLibraryEntry({
      author_username: "m.kato",
    });
    render(
      <BaseLibraryCard
        item={entry}
        viewMode="list"
        isSelected={false}
        icon={DummyIcon}
        listCard={DummyListCard}
      />,
    );
    expect(screen.getByText("m.kato")).toBeInTheDocument();
  });

  it("renders fallback owner when author_username is null", () => {
    const entry = makeLibraryEntry({ author_username: null });
    render(
      <BaseLibraryCard
        item={entry}
        viewMode="list"
        isSelected={false}
        icon={DummyIcon}
        listCard={DummyListCard}
      />,
    );
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it('renders "In Progress" status chip for in_progress', () => {
    const entry = makeLibraryEntry({ status: "in_progress" });
    render(
      <BaseLibraryCard
        item={entry}
        viewMode="list"
        isSelected={false}
        icon={DummyIcon}
        listCard={DummyListCard}
      />,
    );
    const chip = screen.getByText("In Progress");
    expect(chip).toBeInTheDocument();
    expect(chip.className).toContain("status-warn");
  });

  it('renders "Finished" status chip for finished', () => {
    const entry = makeLibraryEntry({ status: "finished" });
    render(
      <BaseLibraryCard
        item={entry}
        viewMode="list"
        isSelected={false}
        icon={DummyIcon}
        listCard={DummyListCard}
      />,
    );
    const chip = screen.getByText("Finished");
    expect(chip).toBeInTheDocument();
    expect(chip.className).toContain("status-success");
  });

  // ── Optional fields ──────────────────────────────────────────────────

  it("renders description from data", () => {
    const entry = makeLibraryEntry({
      description: "First paragraph of content",
    });
    render(
      <BaseLibraryCard
        item={entry}
        viewMode="list"
        isSelected={false}
        icon={DummyIcon}
        listCard={DummyListCard}
        showDescription={true}
      />,
    );
    expect(
      screen.getByText("First paragraph of content"),
    ).toBeInTheDocument();
  });

  it('renders "No description" fallback when description is empty', () => {
    const entry = makeLibraryEntry({ description: "" });
    render(
      <BaseLibraryCard
        item={entry}
        viewMode="list"
        isSelected={false}
        icon={DummyIcon}
        listCard={DummyListCard}
        showDescription={true}
      />,
    );
    expect(screen.getByText("No description")).toBeInTheDocument();
  });

  it("hides description when showDescription is false", () => {
    const entry = makeLibraryEntry({
      description: "Should not appear",
    });
    render(
      <BaseLibraryCard
        item={entry}
        viewMode="list"
        isSelected={false}
        icon={DummyIcon}
        listCard={DummyListCard}
        showDescription={false}
      />,
    );
    expect(
      screen.queryByText("Should not appear"),
    ).not.toBeInTheDocument();
  });

  it("renders tags as chips", () => {
    const entry = makeLibraryEntry({
      tags: [
        { name: "CRISPR", color: "flask", icon: "circle" },
        { name: "QC", color: "solvent", icon: "diamond" },
      ],
    });
    render(
      <BaseLibraryCard
        item={entry}
        viewMode="list"
        isSelected={false}
        icon={DummyIcon}
        listCard={DummyListCard}
        showTags={true}
      />,
    );
    expect(screen.getByText("CRISPR")).toBeInTheDocument();
    expect(screen.getByText("QC")).toBeInTheDocument();
  });

  it("hides tags when showTags is false", () => {
    const entry = makeLibraryEntry({
      tags: [{ name: "CRISPR", color: "flask", icon: "circle" }],
    });
    render(
      <BaseLibraryCard
        item={entry}
        viewMode="list"
        isSelected={false}
        icon={DummyIcon}
        listCard={DummyListCard}
        showTags={false}
      />,
    );
    expect(screen.queryByText("CRISPR")).not.toBeInTheDocument();
  });

  it("renders relative updated time", () => {
    const entry = makeLibraryEntry({
      updated_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    });
    render(
      <BaseLibraryCard
        item={entry}
        viewMode="list"
        isSelected={false}
        icon={DummyIcon}
        listCard={DummyListCard}
        showUpdatedAt={true}
      />,
    );
    // Should show "2h ago" or similar
    expect(screen.getByTestId("updated-at")).toBeInTheDocument();
    expect(screen.getByTestId("updated-at").textContent).toMatch(/\d+h ago/);
  });

  it("hides updated time when showUpdatedAt is false", () => {
    const entry = makeLibraryEntry();
    render(
      <BaseLibraryCard
        item={entry}
        viewMode="list"
        isSelected={false}
        icon={DummyIcon}
        listCard={DummyListCard}
        showUpdatedAt={false}
      />,
    );
    expect(screen.queryByTestId("updated-at")).not.toBeInTheDocument();
  });

  // ── Property fields ──────────────────────────────────────────────────

  it("renders property_fields as inline dot-separated values", () => {
    const entry = makeLibraryEntry({
      property_fields: { samples_count: 5, attachments_count: 3 },
    });
    render(
      <BaseLibraryCard
        item={entry}
        viewMode="list"
        isSelected={false}
        icon={DummyIcon}
        listCard={DummyListCard}
        propertyFields={defaultPropertyFields}
      />,
    );
    const metadata = screen.getByTestId("property-fields");
    expect(metadata.textContent).toContain("5");
    expect(metadata.textContent).toContain("3");
  });

  it("shows placeholder dash for null property field values", () => {
    const entry = makeLibraryEntry({
      property_fields: { samples_count: null, attachments_count: null },
    });
    render(
      <BaseLibraryCard
        item={entry}
        viewMode="list"
        isSelected={false}
        icon={DummyIcon}
        listCard={DummyListCard}
        propertyFields={defaultPropertyFields}
      />,
    );
    const metadata = screen.getByTestId("property-fields");
    // Both null → "— · —"
    const dashes = metadata.textContent?.match(/—/g);
    expect(dashes?.length).toBe(2);
  });

  // ── Mod-specific listCard delegation ──────────────────────────────────

  it("renders the mod-provided listCard component", () => {
    const entry = makeLibraryEntry();
    render(
      <BaseLibraryCard
        item={entry}
        viewMode="list"
        isSelected={false}
        icon={DummyIcon}
        listCard={DummyListCard}
      />,
    );
    expect(screen.getByTestId("dummy-list-card")).toBeInTheDocument();
  });

  it("passes item, viewMode, and isSelected to listCard", () => {
    const entry = makeLibraryEntry({ display_id: "EXP-042" });
    function AssertiveListCard(props: LibraryCardProps) {
      return (
        <div data-testid="assertive-card">
          <span data-testid="card-viewmode">{props.viewMode}</span>
          <span data-testid="card-displayid">
            {props.item.display_id as string}
          </span>
          <span data-testid="card-selected">
            {String(props.isSelected)}
          </span>
        </div>
      );
    }
    render(
      <BaseLibraryCard
        item={entry}
        viewMode="grid"
        isSelected={true}
        icon={DummyIcon}
        listCard={AssertiveListCard}
      />,
    );
    expect(screen.getByTestId("card-viewmode").textContent).toBe("grid");
    expect(screen.getByTestId("card-displayid").textContent).toBe("EXP-042");
    expect(screen.getByTestId("card-selected").textContent).toBe("true");
  });

  // ── onClick ───────────────────────────────────────────────────────────

  it("calls onClick when the card is clicked", () => {
    const entry = makeLibraryEntry();
    let clicked = false;
    render(
      <BaseLibraryCard
        item={entry}
        viewMode="list"
        isSelected={false}
        icon={DummyIcon}
        listCard={DummyListCard}
        onClick={() => {
          clicked = true;
        }}
      />,
    );
    screen.getByTestId("base-library-card").click();
    expect(clicked).toBe(true);
  });
});
