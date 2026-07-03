import { describe, it, expect, beforeEach, vi } from "vitest";
import { ModRegistry } from "../ModRegistry";
import { registerConsole } from "../registerConsole";
import { registerWorkspace } from "../registerWorkspace";
import { registerSettingsSection } from "../registerSettingsSection";
import { registerRoute } from "../registerRoute";
import { registerSidebarAction } from "../registerSidebarAction";
import { registerSlashCommand } from "../registerSlashCommand";
import { registerService } from "../registerService";

/** Reset the singleton between tests. */
function resetRegistry(): ModRegistry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ModRegistry as any).instance = null;
  return ModRegistry.getInstance();
}

function DummyComponent() {
  return null;
}

describe("register functions", () => {
  let registry: ModRegistry;

  beforeEach(() => {
    registry = resetRegistry();
  });

  it("registerConsole delegates to ModRegistry.registerConsole", () => {
    const spy = vi.spyOn(registry, "registerConsole");
    const config = {
      id: "test.console",
      label: "Test",
      icon: DummyComponent,
      route: "/test",
      component: DummyComponent,
      order: 1,
      defaults: {},
    };
    registerConsole(config);
    expect(spy).toHaveBeenCalledWith(config);
  });

  it("registerWorkspace delegates to ModRegistry.registerWorkspace", () => {
    const spy = vi.spyOn(registry, "registerWorkspace");
    const config = {
      id: "test.ws",
      consoleIds: ["c1"],
      label: "Test WS",
      route: "/test/:id",
    };
    registerWorkspace(config);
    expect(spy).toHaveBeenCalledWith(config);
  });

  it("registerSettingsSection delegates to ModRegistry.registerSettingsSection", () => {
    const spy = vi.spyOn(registry, "registerSettingsSection");
    const config = {
      id: "test.section",
      modId: "test-mod",
      label: "Test Section",
      component: DummyComponent,
      order: 1,
    };
    registerSettingsSection(config);
    expect(spy).toHaveBeenCalledWith(config);
  });

  it("registerRoute delegates to ModRegistry.registerRoute", () => {
    const spy = vi.spyOn(registry, "registerRoute");
    const config = {
      id: "test.route",
      modId: "test-mod",
      path: "/test-route",
      component: DummyComponent,
    };
    registerRoute(config);
    expect(spy).toHaveBeenCalledWith(config);
  });

  it("registerSidebarAction delegates to ModRegistry.registerSidebarAction", () => {
    const spy = vi.spyOn(registry, "registerSidebarAction");
    const config = {
      id: "test.action",
      workspaceId: "test.ws",
      component: DummyComponent,
      position: "inline" as const,
    };
    registerSidebarAction(config);
    expect(spy).toHaveBeenCalledWith(config);
  });

  it("registerSlashCommand delegates to ModRegistry.registerSlashCommand", () => {
    const spy = vi.spyOn(registry, "registerSlashCommand");
    const config = {
      id: "test.cmd",
      label: "Test Command",
      workspaces: [],
      action: () => {},
    };
    registerSlashCommand(config);
    expect(spy).toHaveBeenCalledWith(config);
  });

  it("registerService delegates to ModRegistry.registerService", () => {
    const spy = vi.spyOn(registry, "registerService");
    const config = {
      id: "test.service",
      handler: async () => undefined,
    };
    registerService(config);
    expect(spy).toHaveBeenCalledWith(config);
  });
});
