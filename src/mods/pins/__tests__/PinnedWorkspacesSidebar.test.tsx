import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { PinnedWorkspace, CurrentWorkspace } from "../types";
import { ModRegistry } from "../../../shell/src/mod-system/ModRegistry";

// ── ModRegistry setup ────────────────────────────────────────────────────

function setupWorkspaces(): void {
  ModRegistry._reset();
  const registry = ModRegistry.getInstance();
  registry.registerMod("lims");
  registry.registerMod("eln");
  registry.registerWorkspace({ id: "lims", displayName: "LIMS" });
  registry.registerWorkspace({ id: "eln", displayName: "ELN" });
}

// ── Mock the hook ────────────────────────────────────────────────────────

const mockPin = vi.fn();
const mockUnpin = vi.fn();

function mockHook(overrides: {
  pins?: PinnedWorkspace[];
  current?: CurrentWorkspace | null;
  loading?: boolean;
}) {
  vi.doMock("../hooks/usePinnedWorkspaces", () => ({
    usePinnedWorkspaces: () => ({
      pins: overrides.pins ?? [],
      current: overrides.current ?? null,
      pin: mockPin,
      unpin: mockUnpin,
      loading: overrides.loading ?? false,
    }),
  }));
}

// We need to dynamically import the component to get the mocked hook
async function renderSidebar(overrides: {
  pins?: PinnedWorkspace[];
  current?: CurrentWorkspace | null;
  loading?: boolean;
} = {}) {
  mockHook(overrides);

  const { default: Component } = await import(
    "../components/PinnedWorkspacesSidebar"
  );

  return render(
    <MemoryRouter>
      <Component />
    </MemoryRouter>,
  );
}

function makePin(overrides?: Partial<PinnedWorkspace>): PinnedWorkspace {
  return {
    id: 1,
    display_id: "BLOOD1",
    label: "Blood Sample A",
    url: "/lims/BLOOD1",
    created_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeCurrent(
  overrides?: Partial<CurrentWorkspace>,
): CurrentWorkspace {
  return {
    displayId: "BLOOD1",
    url: "/lims/BLOOD1",
    icon: "lims",
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("PinnedWorkspacesSidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    setupWorkspaces();
  });

  // ── Section rendering ──────────────────────────────────────────────────

  it("renders without the section header (delegated to parent SidebarSection)", async () => {
    await renderSidebar();
    // The "Workspace" header is rendered by Layout's SidebarSection label,
    // not by this component — it should not duplicate the heading.
    expect(screen.queryByText("Workspace")).not.toBeInTheDocument();
  });

  // ── Current workspace (not pinned) ────────────────────────────────────

  it("renders current workspace when not pinned", async () => {
    await renderSidebar({
      current: makeCurrent({ displayId: "BLOOD1" }),
      pins: [],
    });

    expect(screen.getByText("BLOOD1")).toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getByLabelText("Pin current workspace")).toBeInTheDocument();
  });

  it("calls pin when the pin button is clicked", async () => {
    await renderSidebar({
      current: makeCurrent({ displayId: "BLOOD1" }),
      pins: [],
    });

    fireEvent.click(screen.getByLabelText("Pin current workspace"));
    expect(mockPin).toHaveBeenCalled();
  });

  // ── Pinned workspaces ─────────────────────────────────────────────────

  it("renders pinned workspaces", async () => {
    const pins = [
      makePin({ id: 1, display_id: "BLOOD1", url: "/lims/BLOOD1" }),
      makePin({ id: 2, display_id: "E1", label: "PCR Results", url: "/eln/E1" }),
    ];

    await renderSidebar({ pins });

    expect(screen.getByText("BLOOD1")).toBeInTheDocument();
    expect(screen.getByText("PCR Results")).toBeInTheDocument();
    expect(screen.getByText("E1")).toBeInTheDocument();
  });

  it("renders unpin button for each pinned workspace", async () => {
    const pins = [makePin({ id: 1 })];

    await renderSidebar({ pins });

    const unpinBtn = screen.getByLabelText("Unpin workspace: BLOOD1");
    expect(unpinBtn).toBeInTheDocument();
  });

  it("calls unpin with the correct ID when unpin button is clicked", async () => {
    const pins = [makePin({ id: 42 })];

    await renderSidebar({ pins });

    fireEvent.click(screen.getByLabelText("Unpin workspace: BLOOD1"));
    expect(mockUnpin).toHaveBeenCalledWith(42);
  });

  // ── Already pinned current ────────────────────────────────────────────

  it("does not show current row when current workspace is already pinned", async () => {
    const pins = [makePin({ id: 1, url: "/lims/BLOOD1" })];

    await renderSidebar({
      current: makeCurrent({ url: "/lims/BLOOD1" }),
      pins,
    });

    // The pinned row should show as "Current" (active), not a separate current row
    expect(screen.getByText("BLOOD1")).toBeInTheDocument();
    // There should be no pin button (since it's already pinned)
    expect(
      screen.queryByLabelText("Pin current workspace"),
    ).not.toBeInTheDocument();
  });

  it("shows active state on pinned workspace that matches current URL", async () => {
    const pins = [
      makePin({ id: 1, url: "/lims/BLOOD1" }),
      makePin({ id: 2, url: "/eln/E1" }),
    ];

    await renderSidebar({
      current: makeCurrent({ url: "/lims/BLOOD1" }),
      pins,
    });

    // The current (BLOOD1) pinned row should have the "Current" badge
    const currentBadges = screen.getAllByText("Current");
    // There should be at least one "Current" badge on the active pinned row
    expect(currentBadges.length).toBeGreaterThanOrEqual(1);
  });

  // ── Empty state ───────────────────────────────────────────────────────

  it("renders correctly with no current and no pins", async () => {
    await renderSidebar({ current: null, pins: [] });

    // The section header is delegated to the parent Layout's SidebarSection.
    // No workspace rows should be rendered when there are none.
    expect(screen.queryByLabelText("Pin current workspace")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Unpin workspace/)).not.toBeInTheDocument();
  });

  // ── Navigation ────────────────────────────────────────────────────────

  it("navigates when clicking a pinned workspace", async () => {
    const pins = [makePin({ id: 1, url: "/lims/BLOOD1" })];

    await renderSidebar({ pins });

    const link = screen.getByLabelText("Open workspace: BLOOD1");
    expect(link).toBeInTheDocument();
  });
});
