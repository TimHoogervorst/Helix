import { describe, expect, it, afterEach } from "vitest";
import { ModRegistry } from "../ModRegistry";

const component = () => null;
const renderer = () => null;

afterEach(() => ModRegistry._reset());

describe("ELN installed/removed registry boot matrix", () => {
  it("keeps the core hubs while exposing ELN editor contributions when installed", () => {
    const registry = ModRegistry.getInstance();
    registry.registerHub({ id: "home", label: "Home", icon: "home", route: "/home", component, order: 0 });
    registry.registerHub({ id: "library", label: "Library", icon: "library", route: "/library", component, order: 1 });
    registry.declareSlot({ id: "eln.editor", accepts: ["editor"], renderer, layout: "vertical", order: 0, defaults: {} });
    registry.registerBlock({ id: "eln.table", label: "Table", component, listensTo: [], onEvent: {}, emits: [], affinity: ["editor"], serialize: () => "{}", deserialize: () => ({}), defaultState: {} });

    expect([...registry.getHubs()].map(([id]) => id)).toEqual(["home", "library"]);
    expect(registry.resolveSlot("eln.editor")?.bindings.map((binding) => binding.id)).toEqual(["eln.table"]);
  });

  it("does not require ELN hubs, slots, or blocks after the package is removed", () => {
    const registry = ModRegistry.getInstance();
    registry.registerHub({ id: "home", label: "Home", icon: "home", route: "/home", component, order: 0 });
    registry.registerHub({ id: "library", label: "Library", icon: "library", route: "/library", component, order: 1 });

    expect([...registry.getHubs()].map(([id]) => id)).toEqual(["home", "library"]);
    expect(registry.resolveSlot("eln.editor")).toBeNull();
    expect(registry.getBlocks().size).toBe(0);
  });
});
