import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ModManifest } from "../../../shell/src/mod-system/types";

vi.mock("../api", () => ({ createTab: vi.fn() }));

async function setupWorkspace() {
  const { ModRegistry } = await import("../../../shell/src/mod-system/ModRegistry");
  ModRegistry._reset();
  ModRegistry.getInstance().registerMod("lims");
  ModRegistry.getInstance().hydrateFromBackend(
    {
      lims: {
        workspaceId: "lims",
        schemaTypes: [{ id: "lims.entity", displayName: "Entity", prefix: "BLOOD", icon: "flask-conical" }],
        actions: [],
      },
    },
    new Map<string, ModManifest>([["lims", { id: "lims", displayName: "LIMS", dependsOn: [] }]]),
  );
}

async function renderHistory(isCollapsed = false) {
  vi.doMock("../hooks/useWorkspaceHistory", () => ({
    useWorkspaceHistory: () => ({
      history: [{ displayId: "BLOOD1", name: "Blood Sample", url: "/lims/BLOOD1", icon: "📄" }],
      remove: vi.fn(),
    }),
  }));

  await setupWorkspace();
  const [{ default: Component }, { SidebarProvider, useSidebar }] = await Promise.all([
    import("../components/WorkspaceHistorySidebar"),
    import("../../../shell/src/workspace/SidebarContext"),
  ]);
  function Toggle() {
    const { toggleSidebar } = useSidebar();
    return <button onClick={toggleSidebar}>Toggle</button>;
  }
  return render(
    <MemoryRouter>
      <SidebarProvider>
        {!isCollapsed && <Toggle />}
        <Component />
      </SidebarProvider>
    </MemoryRouter>,
  );
}

describe("WorkspaceHistorySidebar", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("uses the registered workspace icon instead of the mention emoji", async () => {
    await renderHistory();

    expect(screen.getByTestId("icon-badge")).toBeInTheDocument();
    expect(screen.getByTestId("icon-badge").querySelector("svg")).toBeInTheDocument();
  });
});
