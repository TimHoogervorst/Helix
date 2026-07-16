import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
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

function renderSettingsPage(route = "/settings") {
  return render(
    <MemoryRouter initialEntries={[route]}>
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

  // ── Default selection (no search param) ───────────────────────────────

  it("renders the first section by default when no section param is given", () => {
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

    renderSettingsPage("/settings");

    // The first section's component should be rendered
    expect(screen.getByTestId("section-a")).toBeInTheDocument();
    // The second section's component should NOT be rendered
    expect(screen.queryByTestId("section-b")).not.toBeInTheDocument();
  });

  // ── Search param selection ────────────────────────────────────────────

  it("renders the section specified by the 'section' search param", () => {
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

    renderSettingsPage("/settings?section=s2");

    // Section B should be shown (explicit param)
    expect(screen.queryByTestId("section-a")).not.toBeInTheDocument();
    expect(screen.getByTestId("section-b")).toBeInTheDocument();
  });

  // ── Unknown section param falls back to first ─────────────────────────

  it("falls back to the first section when the param specifies an unknown id", () => {
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

    renderSettingsPage("/settings?section=nonexistent");

    // Should fall back to first section
    expect(screen.getByTestId("section-a")).toBeInTheDocument();
    expect(screen.queryByTestId("section-b")).not.toBeInTheDocument();
  });

  // ── Three sections ────────────────────────────────────────────────────

  it("handles multiple sections and selects by param", () => {
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

    // Default to first
    const { unmount: unmount1 } = render(
      <MemoryRouter initialEntries={["/settings"]}>
        <SettingsPage />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("section-a")).toBeInTheDocument();
    unmount1();

    // Go to middle
    resetRegistry();
    const reg = ModRegistry.getInstance();
    reg.registerMod("mod-a");
    reg.registerSettingsSection({
      id: "s1",
      modId: "mod-a",
      label: "A",
      component: SectionA,
      order: 10,
    });
    reg.registerSettingsSection({
      id: "s2",
      modId: "mod-a",
      label: "B",
      component: SectionB,
      order: 20,
    });
    reg.registerSettingsSection({
      id: "s3",
      modId: "mod-a",
      label: "C",
      component: SectionC,
      order: 30,
    });

    const { unmount: unmount2 } = render(
      <MemoryRouter initialEntries={["/settings?section=s2"]}>
        <SettingsPage />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("section-b")).toBeInTheDocument();
    expect(screen.queryByTestId("section-a")).not.toBeInTheDocument();
    unmount2();

    // Go to last
    resetRegistry();
    const reg2 = ModRegistry.getInstance();
    reg2.registerMod("mod-a");
    reg2.registerSettingsSection({
      id: "s1",
      modId: "mod-a",
      label: "A",
      component: SectionA,
      order: 10,
    });
    reg2.registerSettingsSection({
      id: "s2",
      modId: "mod-a",
      label: "B",
      component: SectionB,
      order: 20,
    });
    reg2.registerSettingsSection({
      id: "s3",
      modId: "mod-a",
      label: "C",
      component: SectionC,
      order: 30,
    });

    render(
      <MemoryRouter initialEntries={["/settings?section=s3"]}>
        <SettingsPage />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("section-c")).toBeInTheDocument();
    expect(screen.queryByTestId("section-a")).not.toBeInTheDocument();
  });

  // ── Section ordering ─────────────────────────────────────────────────

  it("renders sections sorted by order regardless of registration order", () => {
    const registry = ModRegistry.getInstance();
    registry.registerMod("mod-a");
    // Register higher order first
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

    renderSettingsPage("/settings");

    // The first section (lower order) should be auto-selected
    expect(screen.getByTestId("section-a")).toBeInTheDocument();
  });

  // ── No sidebar nav ────────────────────────────────────────────────────

  it("does not render its own sidebar navigation (nav is now in Layout)", () => {
    const registry = ModRegistry.getInstance();
    registry.registerMod("mod-a");
    registry.registerSettingsSection({
      id: "s1",
      modId: "mod-a",
      label: "Section One",
      component: SectionA,
      order: 10,
    });

    renderSettingsPage("/settings");

    // The settings-nav class should not exist (it was on the old internal nav)
    expect(document.querySelector(".settings-nav")).not.toBeInTheDocument();
    expect(document.querySelector(".settings-layout")).not.toBeInTheDocument();
  });
});
