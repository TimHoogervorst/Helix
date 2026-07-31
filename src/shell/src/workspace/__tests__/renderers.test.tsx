import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ButtonGroupRenderer } from "../ButtonGroupRenderer";
import { PanelRenderer } from "../PanelRenderer";
import { TabRenderer } from "../TabRenderer";
import { WorkspaceBus } from "../WorkspaceBus";
import type {
  ButtonBinding,
  BlockBinding,
  SlotContext,
  BlockComponentProps,
} from "../../mod-system/types";

// ── Helpers ──────────────────────────────────────────────────────────────

function DummyComponent() {
  return null;
}

const defaultSlotId = "eln.editor";

const defaultContext: SlotContext = {
  workspaceId: "eln",
  user: { id: "u1", name: "Test User" },
  viewMode: "edit",
  entryId: "e1",
};

function makeButtonBinding(
  overrides?: Partial<ButtonBinding>,
): ButtonBinding {
  return {
    type: "button",
    id: "eln.export",
    label: "Export",
    order: 0,
    onClick: () => {},
    ...overrides,
  };
}

function makeBlockBinding(
  overrides?: Partial<BlockBinding>,
): BlockBinding {
  return {
    type: "block",
    id: "eln.table",
    label: "Table",
    icon: DummyComponent,
    component: DummyComponent,
    listensTo: [],
    onEvent: {},
    emits: [],
    order: 0,
    overrides: {},
    serialize: (state) => JSON.stringify(state),
    deserialize: (json) => JSON.parse(json),
    defaultState: {},
    ...overrides,
  };
}

/** A block component that renders its instance data for assertion. */
function TestBlock({ instance, context }: BlockComponentProps) {
  return (
    <div data-testid={`block-${instance.blockId}`}>
      <span data-testid={`block-id-${instance.blockId}`}>{instance.id}</span>
      <span data-testid={`block-attrs-${instance.blockId}`}>
        {JSON.stringify(instance.attrs)}
      </span>
      <span data-testid={`block-context-workspace-${instance.blockId}`}>
        {context.workspaceId}
      </span>
    </div>
  );
}

// ── ButtonGroupRenderer ──────────────────────────────────────────────────

describe("ButtonGroupRenderer", () => {
  let bus: WorkspaceBus;

  beforeEach(() => {
    bus = new WorkspaceBus();
  });

  it("renders nothing when bindings is empty", () => {
    const { container } = render(
      <ButtonGroupRenderer slotId={defaultSlotId} bindings={[]} bus={bus} context={defaultContext} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders a button for each binding", () => {
    const bindings: ButtonBinding[] = [
      makeButtonBinding({ id: "eln.export", label: "Export" }),
      makeButtonBinding({ id: "eln.lock", label: "Lock", order: 1 }),
    ];

    render(
      <ButtonGroupRenderer slotId={defaultSlotId} bindings={bindings} bus={bus} context={defaultContext} />,
    );

    expect(screen.getByLabelText("Export")).toBeInTheDocument();
    expect(screen.getByLabelText("Lock")).toBeInTheDocument();
  });

  it("buttons are rendered horizontally (flex row)", () => {
    const bindings: ButtonBinding[] = [
      makeButtonBinding({ id: "eln.export", label: "Export" }),
    ];

    render(
      <ButtonGroupRenderer slotId={defaultSlotId} bindings={bindings} bus={bus} context={defaultContext} />,
    );

    // eslint-disable-next-line testing-library/no-node-access
    const container = screen.getByLabelText("Export").parentElement;
    expect(container).not.toBeNull();
    // Check that the flex container has the `flex` class
    expect(container!.className).toContain("flex");
  });

  it("wires onClick handler with bus and context", () => {
    const onClick = vi.fn();
    const bindings: ButtonBinding[] = [
      makeButtonBinding({ id: "eln.export", label: "Export", onClick }),
    ];

    render(
      <ButtonGroupRenderer slotId={defaultSlotId} bindings={bindings} bus={bus} context={defaultContext} />,
    );

    fireEvent.click(screen.getByLabelText("Export"));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith({ bus, context: defaultContext });
  });

  it("onClick handler can call bus.collect", async () => {
    const results: string[] = [];
    const onClick = vi.fn(async ({ bus: b }: { bus: WorkspaceBus }) => {
      const data = await b.collect<string>("data.export");
      results.push(...data);
    });

    bus.on("data.export", () => "block-a-data");
    bus.on("data.export", () => "block-b-data");

    const bindings: ButtonBinding[] = [
      makeButtonBinding({ id: "eln.export", label: "Export", onClick }),
    ];

    render(
      <ButtonGroupRenderer slotId={defaultSlotId} bindings={bindings} bus={bus} context={defaultContext} />,
    );

    fireEvent.click(screen.getByLabelText("Export"));

    // Wait for async handler
    await vi.waitFor(() => {
      expect(results).toEqual(["block-a-data", "block-b-data"]);
    });
  });

  it("renders icon when provided", () => {
    function TestIcon() {
      return <svg data-testid="test-icon" />;
    }

    const bindings: ButtonBinding[] = [
      makeButtonBinding({ id: "eln.export", label: "Export", icon: TestIcon }),
    ];

    render(
      <ButtonGroupRenderer slotId={defaultSlotId} bindings={bindings} bus={bus} context={defaultContext} />,
    );

    expect(screen.getByTestId("test-icon")).toBeInTheDocument();
  });
});

// ── PanelRenderer ────────────────────────────────────────────────────────

describe("PanelRenderer", () => {
  let bus: WorkspaceBus;

  beforeEach(() => {
    bus = new WorkspaceBus();
  });

  it("renders nothing when bindings is empty", () => {
    const { container } = render(
      <PanelRenderer slotId={defaultSlotId} bindings={[]} bus={bus} context={defaultContext} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders each block's component as a stacked panel", () => {
    const bindings: BlockBinding[] = [
      makeBlockBinding({
        id: "eln.table",
        label: "Table",
        component: TestBlock,
      }),
      makeBlockBinding({
        id: "eln.chart",
        label: "Chart",
        component: TestBlock,
        order: 1,
      }),
    ];

    render(
      <PanelRenderer slotId={defaultSlotId} bindings={bindings} bus={bus} context={defaultContext} />,
    );

    expect(screen.getByTestId("block-eln.table")).toBeInTheDocument();
    expect(screen.getByTestId("block-eln.chart")).toBeInTheDocument();
  });

  it("panels are rendered vertically (flex column)", () => {
    const bindings: BlockBinding[] = [
      makeBlockBinding({
        id: "eln.table",
        label: "Table",
        component: TestBlock,
      }),
    ];

    render(
      <PanelRenderer slotId={defaultSlotId} bindings={bindings} bus={bus} context={defaultContext} />,
    );

    // eslint-disable-next-line testing-library/no-node-access
    const container = screen.getByTestId("block-eln.table").parentElement
      ?.parentElement;
    expect(container).not.toBeNull();
    expect(container!.className).toContain("flex-col");
  });

  it("passes context to block components", () => {
    const bindings: BlockBinding[] = [
      makeBlockBinding({
        id: "eln.table",
        label: "Table",
        component: TestBlock,
      }),
    ];

    render(
      <PanelRenderer slotId={defaultSlotId} bindings={bindings} bus={bus} context={defaultContext} />,
    );

    expect(
      screen.getByTestId("block-context-workspace-eln.table").textContent,
    ).toBe("eln");
  });

  it("creates a BlockInstance with unique id and passes it to the block", () => {
    const bindings: BlockBinding[] = [
      makeBlockBinding({
        id: "eln.table",
        label: "Table",
        component: TestBlock,
      }),
    ];

    render(
      <PanelRenderer slotId={defaultSlotId} bindings={bindings} bus={bus} context={defaultContext} />,
    );

    const instanceId = screen.getByTestId("block-id-eln.table").textContent;
    expect(instanceId).toBeTruthy();
    expect(instanceId).toContain("eln.table::");
  });

  it("passes defaultState as initial attrs", () => {
    const bindings: BlockBinding[] = [
      makeBlockBinding({
        id: "eln.table",
        label: "Table",
        component: TestBlock,
        defaultState: { rows: 5, cols: 3 },
      }),
    ];

    render(
      <PanelRenderer slotId={defaultSlotId} bindings={bindings} bus={bus} context={defaultContext} />,
    );

    expect(
      screen.getByTestId("block-attrs-eln.table").textContent,
    ).toBe(JSON.stringify({ rows: 5, cols: 3 }));
  });

  it("subscribes to bus.on() for listensTo events and routes to onEvent", () => {
    const onEventHandler = vi.fn((_instance: unknown, payload: unknown) => payload);
    const bindings: BlockBinding[] = [
      makeBlockBinding({
        id: "eln.table",
        label: "Table",
        component: TestBlock,
        listensTo: ["data.export"],
        onEvent: { "data.export": onEventHandler },
      }),
    ];

    render(
      <PanelRenderer slotId={defaultSlotId} bindings={bindings} bus={bus} context={defaultContext} />,
    );

    bus.emit("data.export", { format: "csv" });

    expect(onEventHandler).toHaveBeenCalledTimes(1);
    // First arg is the instance, second is the payload
    expect(onEventHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        blockId: "eln.table",
        attrs: {},
      }),
      { format: "csv" },
    );
  });

  it("does not subscribe to events not declared in listensTo", () => {
    const onEventHandler = vi.fn();
    const bindings: BlockBinding[] = [
      makeBlockBinding({
        id: "eln.table",
        label: "Table",
        component: TestBlock,
        listensTo: ["data.export"],
        onEvent: { "data.export": onEventHandler },
      }),
    ];

    render(
      <PanelRenderer slotId={defaultSlotId} bindings={bindings} bus={bus} context={defaultContext} />,
    );

    bus.emit("other.event", {});
    expect(onEventHandler).not.toHaveBeenCalled();
  });

  it("cleans up bus subscriptions on unmount", () => {
    const onEventHandler = vi.fn();
    const bindings: BlockBinding[] = [
      makeBlockBinding({
        id: "eln.table",
        label: "Table",
        component: TestBlock,
        listensTo: ["data.export"],
        onEvent: { "data.export": onEventHandler },
      }),
    ];

    const { unmount } = render(
      <PanelRenderer slotId={defaultSlotId} bindings={bindings} bus={bus} context={defaultContext} />,
    );

    unmount();
    bus.emit("data.export", {});

    expect(onEventHandler).not.toHaveBeenCalled();
  });

  it("handles multiple listensTo events on a single block", () => {
    const exportHandler = vi.fn();
    const saveHandler = vi.fn();
    const bindings: BlockBinding[] = [
      makeBlockBinding({
        id: "eln.table",
        label: "Table",
        component: TestBlock,
        listensTo: ["data.export", "entry.saved"],
        onEvent: {
          "data.export": exportHandler,
          "entry.saved": saveHandler,
        },
      }),
    ];

    render(
      <PanelRenderer slotId={defaultSlotId} bindings={bindings} bus={bus} context={defaultContext} />,
    );

    bus.emit("data.export", { format: "csv" });
    bus.emit("entry.saved", { entryId: "e1" });

    expect(exportHandler).toHaveBeenCalledTimes(1);
    expect(saveHandler).toHaveBeenCalledTimes(1);
  });

  it("async onEvent handlers work via bus.collect", async () => {
    const onEventHandler = vi.fn(
      async (_instance: unknown, payload: unknown) => {
        return `exported: ${(payload as { format: string }).format}`;
      },
    );
    const bindings: BlockBinding[] = [
      makeBlockBinding({
        id: "eln.table",
        label: "Table",
        component: TestBlock,
        listensTo: ["data.export"],
        onEvent: { "data.export": onEventHandler },
      }),
    ];

    render(
      <PanelRenderer slotId={defaultSlotId} bindings={bindings} bus={bus} context={defaultContext} />,
    );

    const results = await bus.collect("data.export", { format: "csv" });

    expect(results).toEqual(["exported: csv"]);
  });

  it("onEvent handler receives current instance attrs", () => {
    const receivedAttrs: unknown[] = [];
    const onEventHandler = vi.fn((instance: { attrs: unknown }) => {
      receivedAttrs.push(instance.attrs);
    });

    const bindings: BlockBinding[] = [
      makeBlockBinding({
        id: "eln.table",
        label: "Table",
        component: TestBlock,
        listensTo: ["data.export"],
        onEvent: { "data.export": onEventHandler },
        defaultState: { rows: 10 },
      }),
    ];

    render(
      <PanelRenderer slotId={defaultSlotId} bindings={bindings} bus={bus} context={defaultContext} />,
    );

    bus.emit("data.export", {});
    expect(receivedAttrs).toEqual([{ rows: 10 }]);
  });

  // ── emitAction ─────────────────────────────────────────────────────────

  it("passes emitAction to block component via augmented context", () => {
    const receivedEmitAction: Array<
      ((localId: string, payload?: Record<string, unknown>) => void) | undefined
    > = [];

    function EmitActionTestBlock({ context }: BlockComponentProps) {
      receivedEmitAction.push(context.emitAction);
      return (
        <div data-testid="emit-action-block">
          {typeof context.emitAction}
        </div>
      );
    }

    const bindings: BlockBinding[] = [
      makeBlockBinding({
        id: "eln.registry-table",
        label: "Registry Table",
        component: EmitActionTestBlock,
        emits: [
          { id: "row-added", label: "Row Added", core: "created" as const },
        ],
      }),
    ];

    render(
      <PanelRenderer
        slotId={defaultSlotId}
        bindings={bindings}
        bus={bus}
        context={defaultContext}
      />,
    );

    // emitAction should be a function
    expect(receivedEmitAction[0]).toBeTypeOf("function");
  });

  it("emitAction emits on bus with correct event pattern {blockId}.{localId}", () => {
    const receivedPayloads: unknown[] = [];
    bus.on("eln.registry-table.row-added", (payload) => {
      receivedPayloads.push(payload);
    });

    let capturedEmitAction:
      | ((localId: string, payload?: Record<string, unknown>) => void)
      | undefined;

    function EmitTestBlock({ context }: BlockComponentProps) {
      capturedEmitAction = context.emitAction;
      return <div data-testid="emit-block" />;
    }

    const bindings: BlockBinding[] = [
      makeBlockBinding({
        id: "eln.registry-table",
        label: "Registry Table",
        component: EmitTestBlock,
        emits: [
          { id: "row-added", label: "Row Added", core: "created" as const },
        ],
      }),
    ];

    render(
      <PanelRenderer
        slotId={defaultSlotId}
        bindings={bindings}
        bus={bus}
        context={defaultContext}
      />,
    );

    // Call emitAction and verify it emits on the bus
    capturedEmitAction?.("row-added", { rowCount: 5 });

    expect(receivedPayloads.length).toBe(1);
    expect(receivedPayloads[0]).toMatchObject({
      blockId: "eln.registry-table",
      localId: "row-added",
      payload: { rowCount: 5 },
    });
    expect((receivedPayloads[0] as Record<string, unknown>).blockInstanceId).toBeTypeOf(
      "string",
    );
  });
});

// ── TabRenderer ───────────────────────────────────────────────────────────

describe("TabRenderer", () => {
  let bus: WorkspaceBus;

  beforeEach(() => {
    bus = new WorkspaceBus();
  });

  it("renders nothing when bindings is empty", () => {
    const { container } = render(
      <TabRenderer slotId={defaultSlotId} bindings={[]} bus={bus} context={defaultContext} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders a tab button for each binding with label", () => {
    const bindings: BlockBinding[] = [
      makeBlockBinding({
        id: "eln.table",
        label: "Table",
        component: TestBlock,
      }),
      makeBlockBinding({
        id: "eln.chart",
        label: "Chart",
        component: TestBlock,
        order: 1,
      }),
    ];

    render(
      <TabRenderer slotId={defaultSlotId} bindings={bindings} bus={bus} context={defaultContext} />,
    );

    expect(screen.getByRole("tab", { name: /Table/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Chart/ })).toBeInTheDocument();
  });

  it("first tab is active by default", () => {
    const bindings: BlockBinding[] = [
      makeBlockBinding({
        id: "eln.table",
        label: "Table",
        component: TestBlock,
      }),
      makeBlockBinding({
        id: "eln.chart",
        label: "Chart",
        component: TestBlock,
        order: 1,
      }),
    ];

    render(
      <TabRenderer slotId={defaultSlotId} bindings={bindings} bus={bus} context={defaultContext} />,
    );

    const tableTab = screen.getByRole("tab", { name: /Table/ });
    expect(tableTab.getAttribute("aria-selected")).toBe("true");

    const chartTab = screen.getByRole("tab", { name: /Chart/ });
    expect(chartTab.getAttribute("aria-selected")).toBe("false");
  });

  it("clicking a tab switches the active content", () => {
    const bindings: BlockBinding[] = [
      makeBlockBinding({
        id: "eln.table",
        label: "Table",
        component: TestBlock,
      }),
      makeBlockBinding({
        id: "eln.chart",
        label: "Chart",
        component: TestBlock,
        order: 1,
      }),
    ];

    render(
      <TabRenderer slotId={defaultSlotId} bindings={bindings} bus={bus} context={defaultContext} />,
    );

    // Both tabs are in the DOM (inactive tabs use display:none, not unmounting)
    const tableContent = screen.getByTestId("block-eln.table");
    const chartContent = screen.getByTestId("block-eln.chart");

    // First tab's content should be visible, second hidden
    expect(tableContent).toBeVisible();
    expect(chartContent).not.toBeVisible();

    // Click the chart tab
    fireEvent.click(screen.getByRole("tab", { name: /Chart/ }));

    // Now chart content should be visible and table content hidden
    expect(screen.getByTestId("block-eln.chart")).toBeVisible();
    expect(screen.getByTestId("block-eln.table")).not.toBeVisible();

    // aria-selected should update
    expect(
      screen.getByRole("tab", { name: /Chart/ }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      screen.getByRole("tab", { name: /Table/ }).getAttribute("aria-selected"),
    ).toBe("false");
  });

  it("renders icon in tab button when provided", () => {
    function TestIcon() {
      return <svg data-testid="tab-icon" />;
    }

    const bindings: BlockBinding[] = [
      makeBlockBinding({
        id: "eln.table",
        label: "Table",
        icon: TestIcon,
        component: TestBlock,
      }),
    ];

    render(
      <TabRenderer slotId={defaultSlotId} bindings={bindings} bus={bus} context={defaultContext} />,
    );

    expect(screen.getByTestId("tab-icon")).toBeInTheDocument();
  });

  it("re-selects first tab when active tab is removed from bindings", () => {
    const bindings1: BlockBinding[] = [
      makeBlockBinding({
        id: "eln.table",
        label: "Table",
        component: TestBlock,
      }),
      makeBlockBinding({
        id: "eln.chart",
        label: "Chart",
        component: TestBlock,
        order: 1,
      }),
    ];

    const { rerender } = render(
      <TabRenderer slotId={defaultSlotId} bindings={bindings1} bus={bus} context={defaultContext} />,
    );

    // Switch to Chart
    fireEvent.click(screen.getByRole("tab", { name: /Chart/ }));
    expect(
      screen.getByRole("tab", { name: /Chart/ }).getAttribute("aria-selected"),
    ).toBe("true");

    // Remove chart from bindings
    const bindings2: BlockBinding[] = [
      makeBlockBinding({
        id: "eln.table",
        label: "Table",
        component: TestBlock,
      }),
    ];

    rerender(
      <TabRenderer slotId={defaultSlotId} bindings={bindings2} bus={bus} context={defaultContext} />,
    );

    // Table should be active again
    expect(screen.getByTestId("block-eln.table")).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /Table/ }).getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("passes context to block components", () => {
    const bindings: BlockBinding[] = [
      makeBlockBinding({
        id: "eln.table",
        label: "Table",
        component: TestBlock,
      }),
    ];

    render(
      <TabRenderer slotId={defaultSlotId} bindings={bindings} bus={bus} context={defaultContext} />,
    );

    expect(
      screen.getByTestId("block-context-workspace-eln.table").textContent,
    ).toBe("eln");
  });

  it("subscribes to bus.on() for listensTo events", () => {
    const onEventHandler = vi.fn();
    const bindings: BlockBinding[] = [
      makeBlockBinding({
        id: "eln.table",
        label: "Table",
        component: TestBlock,
        listensTo: ["data.export"],
        onEvent: { "data.export": onEventHandler },
      }),
    ];

    render(
      <TabRenderer slotId={defaultSlotId} bindings={bindings} bus={bus} context={defaultContext} />,
    );

    bus.emit("data.export", { format: "csv" });

    expect(onEventHandler).toHaveBeenCalledTimes(1);
    expect(onEventHandler).toHaveBeenCalledWith(
      expect.objectContaining({ blockId: "eln.table" }),
      { format: "csv" },
    );
  });

  it("cleans up bus subscriptions on unmount", () => {
    const onEventHandler = vi.fn();
    const bindings: BlockBinding[] = [
      makeBlockBinding({
        id: "eln.table",
        label: "Table",
        component: TestBlock,
        listensTo: ["data.export"],
        onEvent: { "data.export": onEventHandler },
      }),
    ];

    const { unmount } = render(
      <TabRenderer slotId={defaultSlotId} bindings={bindings} bus={bus} context={defaultContext} />,
    );

    unmount();
    bus.emit("data.export", {});
    expect(onEventHandler).not.toHaveBeenCalled();
  });

  // ── emitAction ─────────────────────────────────────────────────────────

  it("passes emitAction to block component via augmented context", () => {
    const receivedEmitAction: Array<
      ((localId: string, payload?: Record<string, unknown>) => void) | undefined
    > = [];

    function EmitActionTestBlock({ context }: BlockComponentProps) {
      receivedEmitAction.push(context.emitAction);
      return <div data-testid="emit-action-block" />;
    }

    const bindings: BlockBinding[] = [
      makeBlockBinding({
        id: "eln.registry-table",
        label: "Registry Table",
        component: EmitActionTestBlock,
        emits: [
          { id: "row-added", label: "Row Added", core: "created" as const },
        ],
      }),
    ];

    render(
      <TabRenderer
        slotId={defaultSlotId}
        bindings={bindings}
        bus={bus}
        context={defaultContext}
      />,
    );

    // emitAction should be a function
    expect(receivedEmitAction[0]).toBeTypeOf("function");
  });

  it("emitAction emits on bus with correct event pattern from tab context", () => {
    const receivedPayloads: unknown[] = [];
    bus.on("eln.registry-table.row-added", (payload) => {
      receivedPayloads.push(payload);
    });

    let capturedEmitAction:
      | ((localId: string, payload?: Record<string, unknown>) => void)
      | undefined;

    function EmitTestBlock({ context }: BlockComponentProps) {
      capturedEmitAction = context.emitAction;
      return <div data-testid="emit-block" />;
    }

    const bindings: BlockBinding[] = [
      makeBlockBinding({
        id: "eln.registry-table",
        label: "Registry Table",
        component: EmitTestBlock,
        emits: [
          { id: "row-added", label: "Row Added", core: "created" as const },
        ],
      }),
    ];

    render(
      <TabRenderer
        slotId={defaultSlotId}
        bindings={bindings}
        bus={bus}
        context={defaultContext}
      />,
    );

    // Call emitAction and verify it emits on the bus
    capturedEmitAction?.("row-added", { rowCount: 5 });

    expect(receivedPayloads.length).toBe(1);
    expect(receivedPayloads[0]).toMatchObject({
      blockId: "eln.registry-table",
      localId: "row-added",
      payload: { rowCount: 5 },
    });
  });
});

// ── Type-level tests ──────────────────────────────────────────────────────
//
// These assertions are evaluated at compile time — they produce no runtime
// output.  If `bus` or `sendAction` were still on BlockComponentProps the
// helper type would resolve to `never` and the assignment to `true` would
// fail to compile.

/** Resolves to `true` when K is NOT a key of T, otherwise `never`. */
type AssertNotHasProp<T, K extends string> = K extends keyof T ? never : true;

/**
 * Compile-time type guards verifying `bus` and `sendAction` are not
 * assignable to `BlockComponentProps`.  If either property creeps back
 * into the interface, the return type resolves to `never` and `true`
 * fails to assign, breaking the build.
 */
void ((): AssertNotHasProp<BlockComponentProps, "bus"> => true);
void ((): AssertNotHasProp<BlockComponentProps, "sendAction"> => true);
