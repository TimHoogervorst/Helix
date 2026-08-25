import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { usePinnedWorkspaces } from "../hooks/usePinnedWorkspaces";
import type { PinnedWorkspace } from "../types";
import { ModRegistry } from "../../../shell/src/mod-system/ModRegistry";
import type { ModManifest } from "../../../shell/src/mod-system/types";

// ── Mock API module ──────────────────────────────────────────────────────

vi.mock("../api", () => ({
  getTabs: vi.fn(),
  getTabFolders: vi.fn(),
  createTab: vi.fn(),
  deleteTab: vi.fn(),
  putTabLayout: vi.fn(),
  resolveWorkspace: vi.fn(),
  updateTabLabel: vi.fn(),
}));

import { getTabs, getTabFolders, createTab, deleteTab, putTabLayout, resolveWorkspace, updateTabLabel } from "../api";

// ── ModRegistry setup ──────────────────────────────────────────────────────

/** Ensure workspaces are registered for resolveCurrentWorkspace(). */
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

// ── Helpers ──────────────────────────────────────────────────────────────

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

const mockPins: PinnedWorkspace[] = [
  makePin({ id: 1, display_id: "BLOOD1", url: "/lims/BLOOD1" }),
  makePin({ id: 2, display_id: "E1", url: "/eln/E1", label: "PCR Results" }),
];

function wrapper(initialEntries: string[] = ["/lims/BLOOD1"]) {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
  );
  return Wrapper;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("usePinnedWorkspaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getTabFolders).mockResolvedValue([]);
    vi.mocked(resolveWorkspace).mockResolvedValue(null);
    setupWorkspaces();
  });

  // ── Initial load ──────────────────────────────────────────────────────

  it("fetches pins on mount and exposes them", async () => {
    vi.mocked(getTabs).mockResolvedValue(mockPins);

    const { result } = renderHook(() => usePinnedWorkspaces(), {
      wrapper: wrapper(),
    });

    // Initially loading
    expect(result.current.loading).toBe(true);
    expect(result.current.pins).toEqual([]);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.pins).toEqual(mockPins);
    expect(getTabs).toHaveBeenCalledTimes(1);
  });

  it("handles fetch error gracefully", async () => {
    vi.mocked(getTabs).mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => usePinnedWorkspaces(), {
      wrapper: wrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.pins).toEqual([]);
  });

  // ── Current workspace resolution ──────────────────────────────────────

  it("resolves current workspace from /lims/:displayId URL", async () => {
    vi.mocked(getTabs).mockResolvedValue([]);

    const { result } = renderHook(() => usePinnedWorkspaces(), {
      wrapper: wrapper(["/lims/BLOOD1"]),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.current).toEqual({
      displayId: "BLOOD1",
      url: "/lims/BLOOD1",
      icon: "lims",
    });
  });

  it("resolves current workspace from /eln/:displayId URL", async () => {
    vi.mocked(getTabs).mockResolvedValue([]);

    const { result } = renderHook(() => usePinnedWorkspaces(), {
      wrapper: wrapper(["/eln/E1"]),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.current).toEqual({
      displayId: "E1",
      url: "/eln/E1",
      icon: "eln",
    });
  });

  it("returns null current for non-workspace URLs", async () => {
    vi.mocked(getTabs).mockResolvedValue([]);

    const { result } = renderHook(() => usePinnedWorkspaces(), {
      wrapper: wrapper(["/settings"]),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.current).toBeNull();
  });

  // ── Pin (optimistic) ──────────────────────────────────────────────────

  it("optimistically pins the current workspace", async () => {
    vi.mocked(getTabs).mockResolvedValue([]);

    // Deferred promise so we can observe the optimistic state before resolution
    let resolveCreate: (value: PinnedWorkspace) => void = () => {};
    const createPromise = new Promise<PinnedWorkspace>((resolve) => {
      resolveCreate = resolve;
    });
    vi.mocked(createTab).mockReturnValue(createPromise);

    const { result } = renderHook(() => usePinnedWorkspaces(), {
      wrapper: wrapper(["/lims/BLOOD1"]),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Start the pin (don't await — we want to check the optimistic state)
    let pinPromise: Promise<void> = Promise.resolve();
    await act(async () => {
      pinPromise = result.current.pin();
    });

    // Optimistic pin with negative ID should be present
    expect(result.current.pins).toHaveLength(1);
    expect(result.current.pins[0].display_id).toBe("BLOOD1");
    expect(result.current.pins[0].id).toBeLessThan(0); // optimistic

    // Resolve the API call
    const created = makePin({ id: 3, display_id: "BLOOD1", url: "/lims/BLOOD1" });
    await act(async () => {
      resolveCreate(created);
      await pinPromise;
    });

    // After API resolves, ID should be updated
    expect(result.current.pins[0].id).toBe(3);
  });

  it("rolls back optimistic pin on API error", async () => {
    vi.mocked(getTabs).mockResolvedValue([]);
    vi.mocked(createTab).mockRejectedValue(new Error("Server error"));

    const { result } = renderHook(() => usePinnedWorkspaces(), {
      wrapper: wrapper(["/lims/BLOOD1"]),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.pin();
    });

    // Should roll back — no pins remain
    expect(result.current.pins).toEqual([]);
  });

  it("does nothing when pin is called but there is no current workspace", async () => {
    vi.mocked(getTabs).mockResolvedValue([]);

    const { result } = renderHook(() => usePinnedWorkspaces(), {
      wrapper: wrapper(["/settings"]),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.pin();
    });

    expect(createTab).not.toHaveBeenCalled();
    expect(result.current.pins).toEqual([]);
  });

  it("does not pin if current workspace is already pinned", async () => {
    vi.mocked(getTabs).mockResolvedValue([
      makePin({ id: 1, url: "/lims/BLOOD1" }),
    ]);

    const { result } = renderHook(() => usePinnedWorkspaces(), {
      wrapper: wrapper(["/lims/BLOOD1"]),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.pin();
    });

    expect(createTab).not.toHaveBeenCalled();
  });

  it("persists a reordered layout and applies the server response", async () => {
    vi.mocked(getTabs).mockResolvedValue(mockPins);
    vi.mocked(putTabLayout).mockResolvedValue({ folders: [], tabs: [mockPins[1], mockPins[0]] });

    const { result } = renderHook(() => usePinnedWorkspaces(), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.reorder(1, 2);
    });

    expect(putTabLayout).toHaveBeenCalledWith({
      folders: [],
      tabs: [
        { id: 2, order: 0, folder: null },
        { id: 1, order: 1, folder: null },
      ],
    });
    expect(result.current.pins).toEqual([mockPins[1], mockPins[0]]);
  });

  it("refreshes a matching tab label from the visited workspace", async () => {
    const pin = makePin({ label: "Old name" });
    vi.mocked(getTabs).mockResolvedValue([pin]);
    vi.mocked(resolveWorkspace).mockResolvedValue({
      id: 1,
      display_id: "BLOOD1",
      title: "New name",
      type: "sample",
      icon: "",
      color: "",
      workspaceId: "lims",
    });
    vi.mocked(updateTabLabel).mockResolvedValue({ ...pin, label: "New name" });

    renderHook(() => usePinnedWorkspaces(), { wrapper: wrapper(["/lims/BLOOD1"]) });

    await waitFor(() => expect(updateTabLabel).toHaveBeenCalledWith(1, "New name"));
  });

  it("keeps an unresolved workspace visit usable", async () => {
    vi.mocked(getTabs).mockResolvedValue([makePin()]);
    vi.mocked(resolveWorkspace).mockResolvedValue(null);

    const { result } = renderHook(() => usePinnedWorkspaces(), {
      wrapper: wrapper(["/lims/BLOOD1"]),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.current?.displayId).toBe("BLOOD1");
    expect(updateTabLabel).not.toHaveBeenCalled();
  });

  // ── Unpin (optimistic) ────────────────────────────────────────────────

  it("optimistically unpins a workspace", async () => {
    vi.mocked(getTabs).mockResolvedValue(mockPins);
    vi.mocked(deleteTab).mockResolvedValue(undefined);

    const { result } = renderHook(() => usePinnedWorkspaces(), {
      wrapper: wrapper(["/lims/BLOOD1"]),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.pins).toHaveLength(2);

    await act(async () => {
      await result.current.unpin(1);
    });

    expect(result.current.pins).toHaveLength(1);
    expect(result.current.pins[0].id).toBe(2);
    expect(deleteTab).toHaveBeenCalledWith(1);
  });

  it("rolls back optimistic unpin on API error", async () => {
    vi.mocked(getTabs).mockResolvedValue(mockPins);
    vi.mocked(deleteTab).mockRejectedValue(new Error("Server error"));

    const { result } = renderHook(() => usePinnedWorkspaces(), {
      wrapper: wrapper(["/lims/BLOOD1"]),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.unpin(1);
    });

    // Should roll back — both pins restored
    expect(result.current.pins).toHaveLength(2);
    const restored = result.current.pins.find((p) => p.id === 1);
    expect(restored).toBeDefined();
  });
});
