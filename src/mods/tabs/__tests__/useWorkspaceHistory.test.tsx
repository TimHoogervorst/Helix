import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import type { ModManifest } from "../../../shell/src/mod-system/types";
import { ModRegistry } from "../../../shell/src/mod-system/ModRegistry";
import { useWorkspaceHistory } from "../hooks/useWorkspaceHistory";

vi.mock("../api", () => ({
  resolveWorkspace: vi.fn(),
}));

import { resolveWorkspace } from "../api";

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter initialEntries={["/lims/A"]}>{children}</MemoryRouter>;
}

function setupWorkspace() {
  ModRegistry._reset();
  ModRegistry.getInstance().registerMod("lims");
  ModRegistry.getInstance().hydrateFromBackend(
    { lims: { workspaceId: "lims", schemaTypes: [], actions: [] } },
    new Map<string, ModManifest>([
      ["lims", { id: "lims", displayName: "LIMS", dependsOn: [] }],
    ]),
  );
}

describe("useWorkspaceHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setupWorkspace();
    vi.mocked(resolveWorkspace).mockResolvedValue(null);
  });

  it("records visits, resolves names, and persists them", async () => {
    vi.mocked(resolveWorkspace).mockResolvedValue({
      id: 1,
      display_id: "A",
      title: "Sample A",
      type: "sample",
      icon: "sample",
      color: "blue",
      workspaceId: "lims",
    });

    const { result } = renderHook(() => useWorkspaceHistory(), { wrapper });

    await waitFor(() => expect(result.current.history[0]?.name).toBe("Sample A"));
    expect(result.current.history).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem("helix-workspace-history")!)[0].url).toBe(
      "/lims/A",
    );
  });

  it("removes a history record", async () => {
    localStorage.setItem(
      "helix-workspace-history",
      JSON.stringify([
        { displayId: "B", name: "B", url: "/lims/B", icon: "lims" },
        { displayId: "A", name: "A", url: "/lims/A", icon: "lims" },
      ]),
    );
    const { result } = renderHook(() => useWorkspaceHistory(), { wrapper });
    await waitFor(() => expect(result.current.history).toHaveLength(2));

    act(() => result.current.remove("/lims/B"));
    await waitFor(() => expect(result.current.history).toHaveLength(1));
    expect(result.current.history[0].url).toBe("/lims/A");
  });

  it("deduplicates a stored URL and keeps the newest visit first", async () => {
    localStorage.setItem(
      "helix-workspace-history",
      JSON.stringify([
        { displayId: "A", name: "A", url: "/lims/A", icon: "lims" },
        { displayId: "B", name: "B", url: "/lims/B", icon: "lims" },
      ]),
    );

    const { result } = renderHook(() => useWorkspaceHistory(), { wrapper });
    await waitFor(() => expect(result.current.history[0]?.url).toBe("/lims/A"));
    expect(result.current.history).toHaveLength(2);
  });
});
