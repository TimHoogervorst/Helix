import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SettingsPageLayout } from "../SettingsPageLayout";
import { SettingsHeroHeader } from "../SettingsHeroHeader";
import { SettingsSectionCard } from "../SettingsSectionCard";
import { SettingsMasterList, type MasterListRow } from "../SettingsMasterList";
import { SettingsViewToggle } from "../SettingsViewToggle";

function TestActions() {
  return <button data-testid="action-btn">Action</button>;
}

const sampleRows: MasterListRow[] = [
  { id: "a", label: "Alpha", secondary: "AL" },
  { id: "b", label: "Beta", secondary: "BE" },
  { id: "c", label: "Gamma" },
];

// ── SettingsPageLayout ────────────────────────────────────────────────────

describe("SettingsPageLayout", () => {
  it("renders children inside a max-width container", () => {
    render(
      <SettingsPageLayout>
        <div data-testid="child">Content</div>
      </SettingsPageLayout>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("applies grid-paper class only when hero is provided", () => {
    render(
      <SettingsPageLayout hero={<div>Hero area</div>}>
        <div>Content</div>
      </SettingsPageLayout>,
    );
    const hero = document.querySelector(".grid-paper");
    expect(hero).not.toBeNull();
  });

  it("does not render grid-paper when hero is not provided", () => {
    render(
      <SettingsPageLayout>
        <span data-testid="nested">Nested</span>
      </SettingsPageLayout>,
    );
    const hero = document.querySelector(".grid-paper");
    expect(hero).toBeNull();
    expect(screen.getByTestId("nested")).not.toBeNull();
  });

  it("renders hero content inside the grid-paper region", () => {
    render(
      <SettingsPageLayout hero={<span data-testid="hero-content">Hero</span>}>
        <div>Content</div>
      </SettingsPageLayout>,
    );
    const hero = document.querySelector(".grid-paper");
    expect(hero).not.toBeNull();
    expect(
      hero!.querySelector("[data-testid='hero-content']"),
    ).not.toBeNull();
  });

  it("applies border-b to grid-paper when hero is provided", () => {
    render(
      <SettingsPageLayout hero={<div>Hero area</div>}>
        <div>Content</div>
      </SettingsPageLayout>,
    );
    const hero = document.querySelector(".grid-paper");
    expect(hero).not.toBeNull();
    expect(hero!.className.split(/\s+/)).toContain("border-b");
  });

  it("renders bottomBar when provided", () => {
    render(
      <SettingsPageLayout
        bottomBar={<span data-testid="bottom-bar">Save bar</span>}
      >
        <div>Content</div>
      </SettingsPageLayout>,
    );
    expect(screen.getByTestId("bottom-bar")).toBeInTheDocument();
  });

  it("does not render bottomBar when not provided", () => {
    render(
      <SettingsPageLayout>
        <div>Content</div>
      </SettingsPageLayout>,
    );
    expect(screen.queryByText("Save bar")).not.toBeInTheDocument();
  });
});

// ── SettingsHeroHeader ────────────────────────────────────────────────────

describe("SettingsHeroHeader", () => {
  it("renders the eyebrow with text-eyebrow composite style", () => {
    render(<SettingsHeroHeader eyebrow="schema directory" title="Schemas" />);
    const eyebrow = screen.getByText("schema directory");
    expect(eyebrow).toBeInTheDocument();
    expect(eyebrow.className).toContain("text-eyebrow");
  });

  it("renders the title with text-title composite style", () => {
    render(<SettingsHeroHeader eyebrow="schema directory" title="Schemas" />);
    const title = screen.getByText("Schemas");
    expect(title).toBeInTheDocument();
    expect(title.tagName).toBe("H1");
    expect(title.className).toContain("text-title");
  });

  it("renders description when provided", () => {
    render(
      <SettingsHeroHeader
        eyebrow="settings"
        title="App Settings"
        description="Configure your workspace."
      />,
    );
    expect(
      screen.getByText("Configure your workspace."),
    ).toBeInTheDocument();
  });

  it("does not render description when not provided", () => {
    render(
      <SettingsHeroHeader eyebrow="settings" title="App Settings" />,
    );
    expect(screen.queryByText("Configure")).not.toBeInTheDocument();
  });

  it("renders actions slot content when provided", () => {
    render(
      <SettingsHeroHeader
        eyebrow="settings"
        title="Schemas"
        actions={<TestActions />}
      />,
    );
    expect(screen.getByTestId("action-btn")).toBeInTheDocument();
  });

  it("does not render actions area when not provided", () => {
    render(
      <SettingsHeroHeader eyebrow="settings" title="Schemas" />,
    );
    expect(screen.queryByTestId("action-btn")).not.toBeInTheDocument();
  });
});

// ── SettingsSectionCard ───────────────────────────────────────────────────

describe("SettingsSectionCard", () => {
  it("renders title in the header", () => {
    render(
      <SettingsSectionCard title="Schema definition">
        <div>Content</div>
      </SettingsSectionCard>,
    );
    expect(screen.getByText("Schema definition")).toBeInTheDocument();
  });

  it("renders optional subtitle", () => {
    render(
      <SettingsSectionCard
        title="Schema definition"
        subtitle="Identity fields"
      >
        <div>Content</div>
      </SettingsSectionCard>,
    );
    expect(screen.getByText("Identity fields")).toBeInTheDocument();
  });

  it("renders optional header actions", () => {
    render(
      <SettingsSectionCard title="Columns" actions={<TestActions />}>
        <div>Content</div>
      </SettingsSectionCard>,
    );
    expect(screen.getByTestId("action-btn")).toBeInTheDocument();
  });

  it("renders children content", () => {
    render(
      <SettingsSectionCard title="Details">
        <div data-testid="inner">Inner content</div>
      </SettingsSectionCard>,
    );
    expect(screen.getByTestId("inner")).toBeInTheDocument();
  });

  it("renders the card with rounded border styling", () => {
    render(
      <SettingsSectionCard title="Details">
        <div>Content</div>
      </SettingsSectionCard>,
    );
    const card = document.querySelector(".rounded-lg");
    expect(card).not.toBeNull();
  });
});

describe("SettingsSectionCard collapsible", () => {
  it("collapses children when header is clicked", () => {
    render(
      <SettingsSectionCard title="Details">
        <div data-testid="inner">Inner content</div>
      </SettingsSectionCard>,
    );
    expect(screen.getByTestId("inner")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Details"));
    expect(screen.queryByTestId("inner")).not.toBeInTheDocument();
  });

  it("expands children when header is clicked again", () => {
    render(
      <SettingsSectionCard title="Details">
        <div data-testid="inner">Inner content</div>
      </SettingsSectionCard>,
    );
    const header = screen.getByText("Details");
    fireEvent.click(header);
    expect(screen.queryByTestId("inner")).not.toBeInTheDocument();
    fireEvent.click(header);
    expect(screen.getByTestId("inner")).toBeInTheDocument();
  });

  it("does not collapse when collapsible is false", () => {
    render(
      <SettingsSectionCard title="Details" collapsible={false}>
        <div data-testid="inner">Inner content</div>
      </SettingsSectionCard>,
    );
    fireEvent.click(screen.getByText("Details"));
    expect(screen.getByTestId("inner")).toBeInTheDocument();
  });
});

// ── SettingsMasterList ────────────────────────────────────────────────────

describe("SettingsMasterList", () => {
  const baseProps = {
    rows: sampleRows,
    filterValue: "",
    onFilterChange: vi.fn(),
    onSelect: vi.fn(),
  };

  it("renders all rows", () => {
    render(<SettingsMasterList {...baseProps} />);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("Gamma")).toBeInTheDocument();
  });

  it("renders secondary text when provided", () => {
    render(<SettingsMasterList {...baseProps} />);
    expect(screen.getByText("AL")).toBeInTheDocument();
    expect(screen.getByText("BE")).toBeInTheDocument();
  });

  it("calls onSelect when a row is clicked", () => {
    const onSelect = vi.fn();
    render(<SettingsMasterList {...baseProps} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Alpha"));
    expect(onSelect).toHaveBeenCalledWith("a");
  });

  it("highlights the selected row", () => {
    render(<SettingsMasterList {...baseProps} selectedId="b" />);
    const betaBtn = screen.getByText("Beta").closest("button");
    expect(betaBtn?.className.split(/\s+/)).toContain("bg-[var(--color-primary-subtle)]");
    const alphaBtn = screen.getByText("Alpha").closest("button");
    expect(alphaBtn?.className.split(/\s+/)).not.toContain("bg-[var(--color-primary-subtle)]");
  });

  it("renders a filter search input", () => {
    render(<SettingsMasterList {...baseProps} />);
    const input = screen.getByPlaceholderText("Filter…");
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe("INPUT");
  });

  it("calls onFilterChange when the filter input changes", () => {
    const onFilterChange = vi.fn();
    render(
      <SettingsMasterList {...baseProps} onFilterChange={onFilterChange} />,
    );
    const input = screen.getByPlaceholderText("Filter…");
    fireEvent.change(input, { target: { value: "Al" } });
    expect(onFilterChange).toHaveBeenCalledWith("Al");
  });

  it("uses custom filter placeholder when provided", () => {
    render(
      <SettingsMasterList
        {...baseProps}
        filterPlaceholder="Search schemas…"
      />,
    );
    expect(screen.getByPlaceholderText("Search schemas…")).toBeInTheDocument();
  });

  it("shows dirty indicator for rows with dirty flag", () => {
    const rowsWithDirty: MasterListRow[] = [
      { id: 1, label: "Clean" },
      { id: 2, label: "Dirty", dirty: true },
    ];
    render(
      <SettingsMasterList
        rows={rowsWithDirty}
        filterValue=""
        onFilterChange={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    const dirtyRow = screen.getByText("Dirty").closest("button");
    const dot = dirtyRow?.querySelector(".bg-\\[var\\(--color-primary\\)\\]");
    expect(dot).not.toBeNull();
  });

  it("renders optional actions slot", () => {
    render(
      <SettingsMasterList {...baseProps} actions={<TestActions />} />,
    );
    expect(screen.getByTestId("action-btn")).toBeInTheDocument();
  });

  it("renders row icons when provided", () => {
    const rowsWithIcon: MasterListRow[] = [
      { id: 1, label: "With Icon", icon: <span data-testid="row-icon">*</span> },
    ];
    render(
      <SettingsMasterList
        rows={rowsWithIcon}
        filterValue=""
        onFilterChange={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByTestId("row-icon")).toBeInTheDocument();
  });
});

// ── SettingsViewToggle ────────────────────────────────────────────────────

describe("SettingsViewToggle", () => {
  const segments = [
    { value: "editor", label: "Editor" },
    { value: "map", label: "Relationship map" },
  ];

  it("renders all segments as buttons", () => {
    render(
      <SettingsViewToggle
        segments={segments}
        value="editor"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Editor")).toBeInTheDocument();
    expect(screen.getByText("Relationship map")).toBeInTheDocument();
  });

  it("styles selected segment differently", () => {
    render(
      <SettingsViewToggle
        segments={segments}
        value="editor"
        onChange={vi.fn()}
      />,
    );
    const editorBtn = screen.getByRole("tab", { name: "Editor" });
    const mapBtn = screen.getByRole("tab", { name: "Relationship map" });
    expect(editorBtn.getAttribute("aria-selected")).toBe("true");
    expect(mapBtn.getAttribute("aria-selected")).toBe("false");
  });

  it("calls onChange when a segment is clicked", () => {
    const onChange = vi.fn();
    render(
      <SettingsViewToggle
        segments={segments}
        value="editor"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText("Relationship map"));
    expect(onChange).toHaveBeenCalledWith("map");
  });

  it("uses the TabBar role and styling", () => {
    render(
      <SettingsViewToggle
        segments={segments}
        value="editor"
        onChange={vi.fn()}
      />,
    );
    const tablist = screen.getByRole("tablist");
    expect(tablist).not.toBeNull();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.length).toBeGreaterThan(0);
  });

  it("has correct ARIA attributes for the tab bar", () => {
    render(
      <SettingsViewToggle
        segments={segments}
        value="editor"
        onChange={vi.fn()}
      />,
    );
    const editorTab = screen.getByRole("tab", { name: "Editor" });
    const mapTab = screen.getByRole("tab", { name: "Relationship map" });
    expect(editorTab).toHaveAttribute("aria-selected", "true");
    expect(mapTab).toHaveAttribute("aria-selected", "false");
  });

  it("renders a two-segment toggle", () => {
    render(
      <SettingsViewToggle
        segments={segments}
        value="editor"
        onChange={vi.fn()}
      />,
    );
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(2);
  });

  it("renders a three-segment toggle", () => {
    const threeSegments = [
      { value: "compact", label: "Compact" },
      { value: "list", label: "List" },
      { value: "grid", label: "Grid" },
    ];
    render(
      <SettingsViewToggle
        segments={threeSegments}
        value="compact"
        onChange={vi.fn()}
      />,
    );
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
  });
});
