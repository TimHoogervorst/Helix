import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SettingsPage from "../pages/SettingsPage";
import { ModRegistry } from "../../../core/mod-system/ModRegistry";

// ── Helpers ──────────────────────────────────────────────────────────────

/** Dummy component for use in test registrations. */
function DummyComponent({ label = "default" }: { label?: string }) {
  return <div data-testid={`section-${label}`}>Section: {label}</div>;
}

function SectionA() {
  return <DummyComponent label="a" />;
}
function SectionB() {
  return <DummyComponent label="b" />;
}
function SectionC() {
  return <DummyComponent label="c" />;
}

function resetRegistry(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ModRegistry as any).instance = null;
}

function renderSettingsPage() {
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  );
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("SettingsPage", () => {
  beforeEach(() => {
    resetRegistry();
  });

  afterEach(() => {
    resetRegistry();
  });

  // ── Empty state ───────────────────────────────────────────────────────

  it("renders empty state when no settings sections are registered", () => {
    renderSettingsPage();
    expect(screen.getByText("No settings available.")).toBeInTheDocument();
  });

  // ── Section rendering ─────────────────────────────────────────────────

  it("renders registered settings sections sorted by order", () => {
    const registry = ModRegistry.getInstance();
    registry.registerMod("mod-a");
    registry.registerSettingsSection({
      id: "s2",
      modId: "mod-a",
      label: "Section Two",
      component: SectionB,
      order: 20,
    });
    registry.registerSettingsSection({
      id: "s1",
      modId: "mod-a",
      label: "Section One",
      component: SectionA,
      order: 10,
    });

    renderSettingsPage();

    // Both section nav buttons should be present
    expect(screen.getByText("Section One")).toBeInTheDocument();
    expect(screen.getByText("Section Two")).toBeInTheDocument();

    // Verify order: first button should be "Section One" (lower order)
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toHaveTextContent("Section One");
    expect(buttons[1]).toHaveTextContent("Section Two");
  });

  // ── Default selection ─────────────────────────────────────────────────

  it("auto-selects the first section by default", () => {
    const registry = ModRegistry.getInstance();
    registry.registerMod("mod-a");
    registry.registerSettingsSection({
      id: "s1",
      modId: "mod-a",
      label: "Section One",
      component: SectionA,
      order: 10,
    });
    registry.registerSettingsSection({
      id: "s2",
      modId: "mod-a",
      label: "Section Two",
      component: SectionB,
      order: 20,
    });

    renderSettingsPage();

    // The first section's component should be rendered (the right panel)
    expect(screen.getByTestId("section-a")).toBeInTheDocument();
    // The second section's component should NOT be rendered
    expect(screen.queryByTestId("section-b")).not.toBeInTheDocument();
  });

  // ── Click to select ───────────────────────────────────────────────────

  it("switches to a different section on click", () => {
    const registry = ModRegistry.getInstance();
    registry.registerMod("mod-a");
    registry.registerSettingsSection({
      id: "s1",
      modId: "mod-a",
      label: "Section One",
      component: SectionA,
      order: 10,
    });
    registry.registerSettingsSection({
      id: "s2",
      modId: "mod-a",
      label: "Section Two",
      component: SectionB,
      order: 20,
    });

    renderSettingsPage();

    // Initially section A is shown
    expect(screen.getByTestId("section-a")).toBeInTheDocument();

    // Click on section B
    fireEvent.click(screen.getByText("Section Two"));

    // Now section B should show, section A should not
    expect(screen.queryByTestId("section-a")).not.toBeInTheDocument();
    expect(screen.getByTestId("section-b")).toBeInTheDocument();
  });

  // ── Sticky selection ──────────────────────────────────────────────────

  it("keeps the selected section when clicking the active nav button again", () => {
    const registry = ModRegistry.getInstance();
    registry.registerMod("mod-a");
    registry.registerSettingsSection({
      id: "s1",
      modId: "mod-a",
      label: "Section One",
      component: SectionA,
      order: 10,
    });
    registry.registerSettingsSection({
      id: "s2",
      modId: "mod-a",
      label: "Section Two",
      component: SectionB,
      order: 20,
    });

    renderSettingsPage();

    // Select section B
    fireEvent.click(screen.getByText("Section Two"));
    expect(screen.getByTestId("section-b")).toBeInTheDocument();

    // Click section B again — should stay on B
    fireEvent.click(screen.getByText("Section Two"));
    expect(screen.getByTestId("section-b")).toBeInTheDocument();
  });

  // ── Three sections ────────────────────────────────────────────────────

  it("handles multiple sections correctly", () => {
    const registry = ModRegistry.getInstance();
    registry.registerMod("mod-a");
    registry.registerSettingsSection({
      id: "s1",
      modId: "mod-a",
      label: "A",
      component: SectionA,
      order: 10,
    });
    registry.registerSettingsSection({
      id: "s2",
      modId: "mod-a",
      label: "B",
      component: SectionB,
      order: 20,
    });
    registry.registerSettingsSection({
      id: "s3",
      modId: "mod-a",
      label: "C",
      component: SectionC,
      order: 30,
    });

    renderSettingsPage();

    // All three nav buttons
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);

    // First is auto-selected
    expect(screen.getByTestId("section-a")).toBeInTheDocument();

    // Click last
    fireEvent.click(screen.getByText("C"));
    expect(screen.getByTestId("section-c")).toBeInTheDocument();
    expect(screen.queryByTestId("section-a")).not.toBeInTheDocument();

    // Click middle
    fireEvent.click(screen.getByText("B"));
    expect(screen.getByTestId("section-b")).toBeInTheDocument();
    expect(screen.queryByTestId("section-c")).not.toBeInTheDocument();
  });
});
