import { describe, it, expect, beforeEach, vi } from "vitest";
import { ModRegistry } from "../ModRegistry";
import { registerHub } from "../registerHub";
import { registerSettingsSection } from "../registerSettingsSection";
import { registerRoute } from "../registerRoute";
import { registerSidebarAction } from "../registerSidebarAction";
import { registerLibraryItem } from "../registerLibraryItem";
import { registerBlock } from "../registerBlock";
import { declareSlot } from "../declareSlot";
import { registerButton } from "../registerButton";
import { registerIntoSlot } from "../registerIntoSlot";

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

  it("registerHub delegates to ModRegistry.registerHub", () => {
    const spy = vi.spyOn(registry, "registerHub");
    const config = {
      id: "test.hub",
      label: "Test Hub",
      icon: DummyComponent,
      route: "/test-hub",
      component: DummyComponent,
      order: 5,
    };
    registerHub(config);
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
      workspaceId: "*",
      component: DummyComponent,
      position: "inline" as const,
    };
    registerSidebarAction(config);
    expect(spy).toHaveBeenCalledWith(config);
  });

  it("registerLibraryItem delegates to ModRegistry.registerLibraryItem", () => {
    const spy = vi.spyOn(registry, "registerLibraryItem");
    const config = {
      id: "eln.entry",
      icon: DummyComponent,
      listCard: DummyComponent,
    };
    registerLibraryItem(config);
    expect(spy).toHaveBeenCalledWith(config);
  });

  it("registerBlock delegates to ModRegistry.registerBlock", () => {
    const spy = vi.spyOn(registry, "registerBlock");
    const config = {
      id: "eln.chart",
      label: "Chart",
      icon: DummyComponent,
      component: DummyComponent,
      listensTo: [],
      onEvent: {},
      serialize: (state: Record<string, unknown>) => JSON.stringify(state),
      deserialize: (json: string) => JSON.parse(json),
      defaultState: {},
    };
    registerBlock(config);
    expect(spy).toHaveBeenCalledWith(config);
  });

  it("declareSlot delegates to ModRegistry.declareSlot", () => {
    const spy = vi.spyOn(registry, "declareSlot");
    const config = {
      id: "eln.editor",
      accepts: "block" as const,
      renderer: DummyComponent,
      layout: "vertical" as const,
      order: 0,
      defaults: {},
    };
    declareSlot(config);
    expect(spy).toHaveBeenCalledWith(config);
  });

  it("registerButton delegates to ModRegistry.registerButton", () => {
    const spy = vi.spyOn(registry, "registerButton");
    const config = {
      id: "eln.export",
      label: "Export",
      onClick: () => {},
    };
    registerButton(config);
    expect(spy).toHaveBeenCalledWith(config);
  });

  it("registerIntoSlot delegates to ModRegistry.registerIntoSlot with defaults", () => {
    const spy = vi.spyOn(registry, "registerIntoSlot");
    registerIntoSlot("eln.editor", "eln.table");
    expect(spy).toHaveBeenCalledWith("eln.editor", "eln.table", undefined, undefined);
  });

  it("registerIntoSlot delegates to ModRegistry.registerIntoSlot with all args", () => {
    const spy = vi.spyOn(registry, "registerIntoSlot");
    registerIntoSlot("eln.editor", "eln.table", { nodeType: "inline" }, 5);
    expect(spy).toHaveBeenCalledWith("eln.editor", "eln.table", { nodeType: "inline" }, 5);
  });
});
