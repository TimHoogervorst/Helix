import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import type { PinnedWorkspace, CurrentWorkspace } from "../types";
import { TabRow } from "../components/TabRow";
import { normalizeWorkspaceUrl } from "../navigation";
import { ModRegistry } from "../../../shell/src/mod-system/ModRegistry";
import type { ModManifest } from "../../../shell/src/mod-system/types";

// ── ModRegistry setup ────────────────────────────────────────────────────

function setupWorkspaces(): void {
  ModRegistry._reset();
  const registry = ModRegistry.getInstance();
  registry.registerMod("lims");
  registry.registerMod("eln");
  registry.hydrateFromBackend(
    {
      lims: { workspaceId: "lims", schemaTypes: [], actions: [] },
      eln: { workspaceId: "eln", schemaTypes: [], actions: [] },
    },
    new Map<string, ModManifest>([
      ["lims", { id: "lims", displayName: "LIMS", dependsOn: [] }],
      ["eln", { id: "eln", displayName: "ELN", dependsOn: [] }],
    ]),
  );
}

// ── Mock the hook ────────────────────────────────────────────────────────

const mockPin = vi.fn();
const mockUnpin = vi.fn();
const mockReorder = vi.fn();

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
      reorder: mockReorder,
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

  const [{ default: Component }, { SidebarProvider: Provider }] = await Promise.all([
    import("../components/PinnedWorkspacesSidebar"),
    import("../../../shell/src/workspace/SidebarContext"),
  ]);

  return render(
    <MemoryRouter>
      <Provider>
        <Component />
      </Provider>
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
    // The "Tabs" header is rendered by Layout's SidebarSection label,
    // not by this component — it should not duplicate the heading.
    expect(screen.queryByText("Tabs")).not.toBeInTheDocument();
  });

  it("does not render a separate current workspace row", async () => {
    await renderSidebar({
      current: makeCurrent({ displayId: "BLOOD1" }),
      pins: [],
    });

    expect(screen.queryByText("BLOOD1")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Pin current workspace")).not.toBeInTheDocument();
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

  it("renders pinned workspaces in the supplied order", async () => {
    const pins = [
      makePin({ id: 2, display_id: "E1", label: "Second" }),
      makePin({ id: 1, display_id: "BLOOD1", label: "First" }),
    ];

    await renderSidebar({ pins });

    const rows = screen.getAllByRole("button", { name: /Open workspace:/ });
    expect(rows.map((row) => row.getAttribute("aria-label"))).toEqual([
      "Open workspace: E1",
      "Open workspace: BLOOD1",
    ]);
  });

  it("falls back to the display ID when a tab has no name", async () => {
    await renderSidebar({ pins: [makePin({ label: "" })] });

    expect(screen.getByText("BLOOD1")).toBeInTheDocument();
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

  it("shows active state on pinned workspace that matches current URL", async () => {
    const pins = [
      makePin({ id: 1, url: "/lims/BLOOD1" }),
      makePin({ id: 2, url: "/eln/E1" }),
    ];

    await renderSidebar({
      current: makeCurrent({ url: "/lims/BLOOD1" }),
      pins,
    });

    expect(screen.getAllByLabelText("Open workspace: BLOOD1")[0]).toHaveClass("bg-muted");
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

describe("TabRow", () => {
  it("renders a name with a muted display ID and falls back to the ID", () => {
    const { rerender } = render(
      <TabRow
        displayId="BLOOD1"
        name="Blood Sample A"
        icon={<span>icon</span>}
        ariaLabel="Open tab"
        onClick={() => {}}
      />,
    );

    expect(screen.getByText("Blood Sample A")).toBeInTheDocument();
    expect(screen.getByText("BLOOD1")).toHaveClass("text-muted-foreground");

    rerender(
      <TabRow
        displayId="BLOOD1"
        name=""
        icon={<span>icon</span>}
        ariaLabel="Open tab"
        onClick={() => {}}
      />,
    );
    expect(screen.getByText("BLOOD1")).not.toHaveClass("text-muted-foreground");
  });

  it("keeps workspace URLs rooted when opened from a nested route", () => {
    expect(normalizeWorkspaceUrl("lims/BLOOD1")).toBe("/lims/BLOOD1");
    expect(normalizeWorkspaceUrl("/eln/E1")).toBe("/eln/E1");
  });
});
