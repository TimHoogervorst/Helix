import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { SlotRenderer } from "../SlotRenderer";
import { ModRegistry } from "../../mod-system/ModRegistry";
import { WorkspaceBus } from "../WorkspaceBus";
import type {
  SlotContext,
  BlockBinding,
  ButtonBinding,
  RendererProps,
  BlockRegistration,
  SlotDeclaration,
  ButtonRegistration,
} from "../../mod-system/types";

// ── Helpers ──────────────────────────────────────────────────────────────

function DummyComponent() {
  return null;
}

function resetRegistry(): ModRegistry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ModRegistry as any).instance = null;
  return ModRegistry.getInstance();
}

function makeBlockRegistration(
  overrides?: Partial<BlockRegistration>,
): BlockRegistration {
  return {
    id: "eln.table",
    label: "Table",
    icon: DummyComponent,
    component: DummyComponent,
    listensTo: [],
    onEvent: {},
    serialize: (state) => JSON.stringify(state),
    deserialize: (json) => JSON.parse(json),
    defaultState: {},
    ...overrides,
  };
}

function makeButtonRegistration(
  overrides?: Partial<ButtonRegistration>,
): ButtonRegistration {
  return {
    id: "eln.export",
    label: "Export",
    onClick: () => {},
    ...overrides,
  };
}

function makeSlotDeclaration(
  overrides?: Partial<SlotDeclaration>,
): SlotDeclaration {
  return {
    id: "eln.editor",
    accepts: "block",
    renderer: DummyComponent,
    layout: "vertical",
    order: 0,
    defaults: {},
    ...overrides,
  };
}

const defaultContext: SlotContext = {
  workspaceId: "eln",
  user: { id: "u1", name: "Test User" },
  viewMode: "edit",
  entryId: "e1",
};

// ── Stub renderer that captures what it receives ─────────────────────────

/** A stub renderer that records the props it receives for assertion. */
interface StubRendererData {
  slotId: string;
  bindings: unknown;
  bus: unknown;
  context: unknown;
}

function createStubRenderer(label = "stub-renderer") {
  let lastProps: StubRendererData | null = null;

  function StubRenderer(props: RendererProps) {
    lastProps = {
      slotId: props.slotId,
      bindings: props.bindings,
      bus: props.bus,
      context: props.context,
    };
    return <div data-testid={label}>Stub {label}</div>;
  }

  return { StubRenderer, getProps: () => lastProps };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("SlotRenderer", () => {
  let registry: ModRegistry;
  let bus: WorkspaceBus;

  beforeEach(() => {
    registry = resetRegistry();
    bus = new WorkspaceBus();
  });

  // ── Empty / missing slot ──────────────────────────────────────────────

  it("renders nothing when the slot is not declared", () => {
    const { container } = render(
      <SlotRenderer
        slotId="nonexistent.slot"
        bus={bus}
        context={defaultContext}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when the slot has no bindings", () => {
    registry.declareSlot(
      makeSlotDeclaration({ id: "eln.editor", accepts: "block" }),
    );

    const { container } = render(
      <SlotRenderer
        slotId="eln.editor"
        bus={bus}
        context={defaultContext}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  // ── Delegation ────────────────────────────────────────────────────────

  it("delegates to the slot's renderer component", () => {
    const { StubRenderer, getProps } = createStubRenderer();

    registry.declareSlot(
      makeSlotDeclaration({
        id: "eln.editor",
        accepts: "block",
        renderer: StubRenderer,
      }),
    );
    registry.registerBlock(makeBlockRegistration({ id: "eln.table" }));
    registry.registerIntoSlot("eln.editor", "eln.table");

    render(
      <SlotRenderer
        slotId="eln.editor"
        bus={bus}
        context={defaultContext}
      />,
    );

    expect(screen.getByTestId("stub-renderer")).toBeInTheDocument();
    // slotId is propagated to the renderer
    expect(getProps()!.slotId).toBe("eln.editor");
  });

  it("passes resolved bindings to the renderer", () => {
    const { StubRenderer, getProps } = createStubRenderer();

    registry.declareSlot(
      makeSlotDeclaration({
        id: "eln.editor",
        accepts: "block",
        renderer: StubRenderer,
      }),
    );
    registry.registerBlock(
      makeBlockRegistration({ id: "eln.table", label: "Table" }),
    );
    registry.registerIntoSlot("eln.editor", "eln.table");

    render(
      <SlotRenderer
        slotId="eln.editor"
        bus={bus}
        context={defaultContext}
      />,
    );

    const props = getProps();
    expect(props).not.toBeNull();
    expect(props!.bus).toBe(bus);
    expect(props!.context).toBe(defaultContext);

    const bindings = props!.bindings as BlockBinding[];
    expect(bindings).toHaveLength(1);
    expect(bindings[0].id).toBe("eln.table");
    expect(bindings[0].type).toBe("block");
  });

  it("passes the bus instance to the renderer", () => {
    const { StubRenderer, getProps } = createStubRenderer();

    registry.declareSlot(
      makeSlotDeclaration({
        id: "eln.editor",
        accepts: "block",
        renderer: StubRenderer,
      }),
    );
    registry.registerBlock(makeBlockRegistration({ id: "eln.table" }));
    registry.registerIntoSlot("eln.editor", "eln.table");

    render(
      <SlotRenderer
        slotId="eln.editor"
        bus={bus}
        context={defaultContext}
      />,
    );

    expect(getProps()!.bus).toBe(bus);
  });

  it("passes the context to the renderer", () => {
    const { StubRenderer, getProps } = createStubRenderer();

    registry.declareSlot(
      makeSlotDeclaration({
        id: "eln.editor",
        accepts: "block",
        renderer: StubRenderer,
      }),
    );
    registry.registerBlock(makeBlockRegistration({ id: "eln.table" }));
    registry.registerIntoSlot("eln.editor", "eln.table");

    render(
      <SlotRenderer
        slotId="eln.editor"
        bus={bus}
        context={defaultContext}
      />,
    );

    expect(getProps()!.context).toBe(defaultContext);
  });

  // ── Bindings resolved correctly ───────────────────────────────────────

  it("resolves button bindings for a button-accepting slot", () => {
    const { StubRenderer, getProps } = createStubRenderer();

    registry.declareSlot(
      makeSlotDeclaration({
        id: "eln.header.actions",
        accepts: "button",
        renderer: StubRenderer,
      }),
    );
    registry.registerButton(
      makeButtonRegistration({ id: "eln.export", label: "Export" }),
    );
    registry.registerButton(
      makeButtonRegistration({ id: "eln.lock", label: "Lock" }),
    );
    registry.registerIntoSlot("eln.header.actions", "eln.export", {}, 0);
    registry.registerIntoSlot("eln.header.actions", "eln.lock", {}, 1);

    render(
      <SlotRenderer
        slotId="eln.header.actions"
        bus={bus}
        context={defaultContext}
      />,
    );

    const bindings = getProps()!.bindings as ButtonBinding[];
    expect(bindings).toHaveLength(2);
    expect(bindings[0].type).toBe("button");
    expect(bindings[0].id).toBe("eln.export");
    expect(bindings[1].id).toBe("eln.lock");
  });

  // ── Bindings sorted by order ──────────────────────────────────────────

  it("bindings are sorted by order ascending", () => {
    const { StubRenderer, getProps } = createStubRenderer();

    registry.declareSlot(
      makeSlotDeclaration({
        id: "eln.editor",
        accepts: "block",
        renderer: StubRenderer,
      }),
    );
    registry.registerBlock(makeBlockRegistration({ id: "eln.table" }));
    registry.registerBlock(makeBlockRegistration({ id: "eln.chart" }));
    registry.registerBlock(makeBlockRegistration({ id: "eln.comment" }));

    registry.registerIntoSlot("eln.editor", "eln.chart", {}, 5);
    registry.registerIntoSlot("eln.editor", "eln.table", {}, 0);
    registry.registerIntoSlot("eln.editor", "eln.comment", {}, 10);

    render(
      <SlotRenderer
        slotId="eln.editor"
        bus={bus}
        context={defaultContext}
      />,
    );

    const bindings = getProps()!.bindings as BlockBinding[];
    expect(bindings[0].id).toBe("eln.table");   // order 0
    expect(bindings[1].id).toBe("eln.chart");    // order 5
    expect(bindings[2].id).toBe("eln.comment");  // order 10
  });

  // ── Slot defaults merged with per-binding overrides ───────────────────

  it("merges slot defaults with per-binding overrides (binding wins)", () => {
    const { StubRenderer, getProps } = createStubRenderer();

    registry.declareSlot(
      makeSlotDeclaration({
        id: "eln.editor",
        accepts: "block",
        renderer: StubRenderer,
        defaults: { nodeType: "block", atom: true, group: "content" },
      }),
    );
    registry.registerBlock(makeBlockRegistration({ id: "eln.mention" }));
    // Override nodeType and atom; keep group from defaults
    registry.registerIntoSlot("eln.editor", "eln.mention", {
      nodeType: "inline",
      atom: false,
    });

    render(
      <SlotRenderer
        slotId="eln.editor"
        bus={bus}
        context={defaultContext}
      />,
    );

    const bindings = getProps()!.bindings as BlockBinding[];
    expect(bindings[0].overrides).toEqual({
      nodeType: "inline",
      atom: false,
      group: "content",
    });
  });

  // ── Correct renderer per slot ─────────────────────────────────────────

  it("selects the correct renderer component per slot declaration", () => {
    const { StubRenderer: StubA } = createStubRenderer("stub-a");
    const { StubRenderer: StubB } = createStubRenderer("stub-b");

    // Slot A uses StubA
    registry.declareSlot(
      makeSlotDeclaration({
        id: "eln.editor",
        accepts: "block",
        renderer: StubA,
      }),
    );
    registry.registerBlock(makeBlockRegistration({ id: "eln.table" }));
    registry.registerIntoSlot("eln.editor", "eln.table");

    // Slot B uses StubB
    registry.declareSlot(
      makeSlotDeclaration({
        id: "eln.sidebar",
        accepts: "block",
        renderer: StubB,
      }),
    );
    registry.registerBlock(makeBlockRegistration({ id: "eln.chart" }));
    registry.registerIntoSlot("eln.sidebar", "eln.chart");

    // Render slot A — should use StubA
    const { rerender } = render(
      <SlotRenderer
        slotId="eln.editor"
        bus={bus}
        context={defaultContext}
      />,
    );
    expect(screen.getByTestId("stub-a")).toBeInTheDocument();

    // Re-render with slot B — should switch to StubB
    rerender(
      <SlotRenderer
        slotId="eln.sidebar"
        bus={bus}
        context={defaultContext}
      />,
    );
    expect(screen.getByTestId("stub-b")).toBeInTheDocument();
    // Old stub should be gone
    expect(screen.queryByTestId("stub-a")).not.toBeInTheDocument();
  });

  // ── Dynamic re-resolution ─────────────────────────────────────────────

  it("re-resolves when slotId changes", () => {
    const { StubRenderer: StubA, getProps: getA } = createStubRenderer();
    const { StubRenderer: StubB, getProps: getB } = createStubRenderer();

    registry.declareSlot(
      makeSlotDeclaration({
        id: "eln.editor",
        accepts: "block",
        renderer: StubA,
      }),
    );
    registry.declareSlot(
      makeSlotDeclaration({
        id: "eln.sidebar",
        accepts: "button",
        renderer: StubB,
      }),
    );
    registry.registerBlock(makeBlockRegistration({ id: "eln.table" }));
    registry.registerButton(makeButtonRegistration({ id: "eln.export" }));
    registry.registerIntoSlot("eln.editor", "eln.table");
    registry.registerIntoSlot("eln.sidebar", "eln.export");

    const { rerender } = render(
      <SlotRenderer
        slotId="eln.editor"
        bus={bus}
        context={defaultContext}
      />,
    );
    expect(getA()).not.toBeNull();

    rerender(
      <SlotRenderer
        slotId="eln.sidebar"
        bus={bus}
        context={defaultContext}
      />,
    );
    expect(getB()).not.toBeNull();
  });

  // ── All blocks participate ────────────────────────────────────────────

  it("resolves blocks that have a component (all BlockRegistration entries)", () => {
    const { StubRenderer } = createStubRenderer();

    registry.declareSlot(
      makeSlotDeclaration({
        id: "eln.editor",
        accepts: "block",
        renderer: StubRenderer,
      }),
    );
    // All blocks are BlockRegistration now — they all have component/serialize
    registry.registerBlock(
      makeBlockRegistration({ id: "eln.legacy-block", label: "Legacy" }),
    );
    registry.registerIntoSlot("eln.editor", "eln.legacy-block");

    const { container } = render(
      <SlotRenderer
        slotId="eln.editor"
        bus={bus}
        context={defaultContext}
      />,
    );
    // Block is resolved — container renders the stub renderer's output
    expect(container.innerHTML).not.toBe("");
  });

  // ── All BlockRegistration fields propagated to bindings ───────────────

  it("propagates all BlockRegistration fields into resolved block bindings", () => {
    const { StubRenderer, getProps } = createStubRenderer();

    const serialize = (s: Record<string, unknown>) => JSON.stringify(s);
    const deserialize = (j: string) => JSON.parse(j);
    const getDisplayName = (attrs: Record<string, unknown>) => String(attrs.name ?? "");

    registry.declareSlot(
      makeSlotDeclaration({
        id: "eln.editor",
        accepts: "block",
        renderer: StubRenderer,
      }),
    );
    registry.registerBlock(
      makeBlockRegistration({
        id: "eln.table",
        label: "Table",
        icon: DummyComponent,
        component: DummyComponent,
        listensTo: ["data.export", "entry.saved"],
        onEvent: { "data.export": () => "result" },
        messages: { edited: "spreadsheet updated" },
        getDisplayName,
        tags: ["data", "table"],
        serialize,
        deserialize,
        defaultState: { rows: 0, cols: 0 },
      }),
    );
    registry.registerIntoSlot("eln.editor", "eln.table");

    render(
      <SlotRenderer
        slotId="eln.editor"
        bus={bus}
        context={defaultContext}
      />,
    );

    const bindings = getProps()!.bindings as BlockBinding[];
    const b = bindings[0];
    expect(b.type).toBe("block");
    expect(b.id).toBe("eln.table");
    expect(b.label).toBe("Table");
    expect(b.listensTo).toEqual(["data.export", "entry.saved"]);
    expect(b.onEvent["data.export"]).toBeDefined();
    expect(b.messages).toEqual({ edited: "spreadsheet updated" });
    expect(b.getDisplayName).toBe(getDisplayName);
    expect(b.tags).toEqual(["data", "table"]);
    expect(b.serialize).toBe(serialize);
    expect(b.deserialize).toBe(deserialize);
    expect(b.defaultState).toEqual({ rows: 0, cols: 0 });
  });
});
