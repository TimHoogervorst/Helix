import { describe, it, expect, beforeEach, vi } from "vitest";
import { ModRegistry } from "../ModRegistry";
import { registerHub } from "../registerHub";
import { registerSettingsSection } from "../registerSettingsSection";
import { registerRoute } from "../registerRoute";
import { registerSidebarAction } from "../registerSidebarAction";
import { registerLibraryItem } from "../registerLibraryItem";
import { registerBlock } from "../registerBlock";
import { BLOCK_TYPE_TIPTAP_NODE } from "../types";

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
      id: "eln.table",
      label: "Table",
      description: "Insert a schema-backed LIMS table",
      icon: "📊",
      type: BLOCK_TYPE_TIPTAP_NODE,
      payload: { node: DummyComponent },
    };
    registerBlock(config);
    expect(spy).toHaveBeenCalledWith(config);
  });
});
