import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { usePinnedWorkspaces } from "../hooks/usePinnedWorkspaces";
import type { PinnedWorkspace } from "../types";
import { ModRegistry } from "../../../core/mod-system/ModRegistry";

// ── Mock API module ──────────────────────────────────────────────────────

vi.mock("../api", () => ({
  getPins: vi.fn(),
  createPin: vi.fn(),
  deletePin: vi.fn(),
}));

import { getPins, createPin, deletePin } from "../api";

// ── ModRegistry setup ──────────────────────────────────────────────────────

/** Ensure workspaces are registered for resolveCurrentWorkspace(). */
function setupWorkspaces(): void {
  ModRegistry._reset();
  const registry = ModRegistry.getInstance();
  registry.registerMod("lims");
  registry.registerMod("eln");
  registry.registerWorkspace({ id: "lims", displayName: "LIMS" });
  registry.registerWorkspace({ id: "eln", displayName: "ELN" });
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
    setupWorkspaces();
  });

  // ── Initial load ──────────────────────────────────────────────────────

  it("fetches pins on mount and exposes them", async () => {
    vi.mocked(getPins).mockResolvedValue(mockPins);

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
    expect(getPins).toHaveBeenCalledTimes(1);
  });

  it("handles fetch error gracefully", async () => {
    vi.mocked(getPins).mockRejectedValue(new Error("Network error"));

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
    vi.mocked(getPins).mockResolvedValue([]);

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
    vi.mocked(getPins).mockResolvedValue([]);

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
    vi.mocked(getPins).mockResolvedValue([]);

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
    vi.mocked(getPins).mockResolvedValue([]);

    // Deferred promise so we can observe the optimistic state before resolution
    let resolveCreate: (value: PinnedWorkspace) => void = () => {};
    const createPromise = new Promise<PinnedWorkspace>((resolve) => {
      resolveCreate = resolve;
    });
    vi.mocked(createPin).mockReturnValue(createPromise);

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
    vi.mocked(getPins).mockResolvedValue([]);
    vi.mocked(createPin).mockRejectedValue(new Error("Server error"));

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
    vi.mocked(getPins).mockResolvedValue([]);

    const { result } = renderHook(() => usePinnedWorkspaces(), {
      wrapper: wrapper(["/settings"]),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.pin();
    });

    expect(createPin).not.toHaveBeenCalled();
    expect(result.current.pins).toEqual([]);
  });

  it("does not pin if current workspace is already pinned", async () => {
    vi.mocked(getPins).mockResolvedValue([
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

    expect(createPin).not.toHaveBeenCalled();
  });

  // ── Unpin (optimistic) ────────────────────────────────────────────────

  it("optimistically unpins a workspace", async () => {
    vi.mocked(getPins).mockResolvedValue(mockPins);
    vi.mocked(deletePin).mockResolvedValue(undefined);

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
    expect(deletePin).toHaveBeenCalledWith(1);
  });

  it("rolls back optimistic unpin on API error", async () => {
    vi.mocked(getPins).mockResolvedValue(mockPins);
    vi.mocked(deletePin).mockRejectedValue(new Error("Server error"));

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
