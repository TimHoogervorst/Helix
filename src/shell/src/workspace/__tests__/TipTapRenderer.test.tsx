import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import { TipTapRenderer } from "../TipTapRenderer/TipTapRenderer";
import { createBlockNode } from "../TipTapRenderer/createBlockNode";
import { WorkspaceBus } from "../WorkspaceBus";
import type {
  BlockBinding,
  SlotContext,
  BlockComponentProps,
} from "../../mod-system/types";
import type { Editor } from "@tiptap/core";

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
    order: 0,
    overrides: {},
    serialize: (state: Record<string, unknown>) => JSON.stringify(state),
    deserialize: (json: string) => JSON.parse(json),
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
      <button
        data-testid={`update-attrs-btn-${instance.blockId}`}
        onClick={() => instance.updateAttrs({ updated: true })}
      >
        Update
      </button>
    </div>
  );
}

/** Helper to capture the editor instance from onCreate callback. */
function captureEditor(): { editor: Editor | null } {
  const capture: { editor: Editor | null } = { editor: null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (capture as any).onCreate = (editor: Editor) => {
    capture.editor = editor;
  };
  return capture;
}

// ── createBlockNode (unit) ──────────────────────────────────────────────

describe("createBlockNode", () => {
  let bus: WorkspaceBus;

  beforeEach(() => {
    bus = new WorkspaceBus();
  });

  it("creates a Node extension named after the binding id", () => {
    const binding = makeBlockBinding({ id: "eln.table" });
    const node = createBlockNode(binding, bus, defaultSlotId, defaultContext);

    expect(node.name).toBe("eln.table");
  });

  it("sets group to 'block' by default", () => {
    const binding = makeBlockBinding({ id: "eln.table", overrides: {} });
    const node = createBlockNode(binding, bus, defaultSlotId, defaultContext);

    expect(node.config.group).toBe("block");
  });

  it("sets group to 'inline' when overrides.nodeType is 'inline'", () => {
    const binding = makeBlockBinding({
      id: "eln.mention",
      overrides: { nodeType: "inline" },
    });
    const node = createBlockNode(binding, bus, defaultSlotId, defaultContext);

    expect(node.config.group).toBe("inline");
  });

  it("uses explicit overrides.group when provided", () => {
    const binding = makeBlockBinding({
      id: "eln.table",
      overrides: { group: "customGroup" },
    });
    const node = createBlockNode(binding, bus, defaultSlotId, defaultContext);

    expect(node.config.group).toBe("customGroup");
  });

  it("overrides.group takes precedence over overrides.nodeType", () => {
    const binding = makeBlockBinding({
      id: "eln.table",
      overrides: { group: "customGroup", nodeType: "inline" },
    });
    const node = createBlockNode(binding, bus, defaultSlotId, defaultContext);

    // Explicit group wins over nodeType shorthand
    expect(node.config.group).toBe("customGroup");
  });

  it("sets atom to true by default", () => {
    const binding = makeBlockBinding({ id: "eln.table", overrides: {} });
    const node = createBlockNode(binding, bus, defaultSlotId, defaultContext);

    expect(node.config.atom).toBe(true);
  });

  it("sets atom to false when overrides.atom is false", () => {
    const binding = makeBlockBinding({
      id: "eln.mention",
      overrides: { atom: false },
    });
    const node = createBlockNode(binding, bus, defaultSlotId, defaultContext);

    expect(node.config.atom).toBe(false);
  });

  it("generates content attribute with defaultState serialized as default", () => {
    const binding = makeBlockBinding({
      id: "eln.table",
      defaultState: { rows: 5, cols: 3 },
    });
    const node = createBlockNode(binding, bus, defaultSlotId, defaultContext);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attrs = (node.config.addAttributes as any)?.();
    expect(attrs.content.default).toBe(JSON.stringify({ rows: 5, cols: 3 }));
  });

  it("renderHTML outputs data-content attribute with serialized content", () => {
    const binding = makeBlockBinding({ id: "eln.table" });
    const node = createBlockNode(binding, bus, defaultSlotId, defaultContext);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attrs = (node.config.addAttributes as any)?.();

    const htmlOutput = attrs.content.renderHTML({
      content: JSON.stringify({ rows: 2 }),
    });

    expect(htmlOutput).toEqual({
      "data-content": JSON.stringify({ rows: 2 }),
    });
  });

  it("renderHTML uses data-block-type attribute for node tag", () => {
    const binding = makeBlockBinding({ id: "eln.chart" });
    const node = createBlockNode(binding, bus, defaultSlotId, defaultContext);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const html = (node.config as any).renderHTML?.({
      HTMLAttributes: {
        "data-content": "{}",
      },
    });
    expect(html).toBeDefined();
    // DOMOutputSpec: [tag, attrs, ...children]
    const tag = (html as Array<unknown>)[0];
    const attrs = (html as Array<unknown>)[1] as Record<string, unknown>;
    expect(tag).toBe("div");
    expect(attrs["data-block-type"]).toBe("eln.chart");
    expect(attrs["data-content"]).toBe("{}");
  });

  it("parseHTML matches div with data-block-type attribute", () => {
    const binding = makeBlockBinding({ id: "eln.table" });
    const node = createBlockNode(binding, bus, defaultSlotId, defaultContext);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parseRules = (node.config.parseHTML as any)?.();
    expect(parseRules[0].tag).toBe('div[data-block-type="eln.table"]');
  });

  it("parseHTML content fallback to defaultState when data-content missing", () => {
    const binding = makeBlockBinding({
      id: "eln.table",
      defaultState: { rows: 1 },
    });
    const node = createBlockNode(binding, bus, defaultSlotId, defaultContext);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attrs = (node.config.addAttributes as any)?.();

    // Simulate a HTML element with no data-content attribute
    const parsed = attrs.content.parseHTML(document.createElement("div"));
    expect(parsed).toBe(JSON.stringify({ rows: 1 }));
  });

  it("each call returns a distinct Node type with its own name", () => {
    const tableBinding = makeBlockBinding({ id: "eln.table" });
    const chartBinding = makeBlockBinding({ id: "eln.chart" });

    const tableNode = createBlockNode(tableBinding, bus, defaultSlotId, defaultContext);
    const chartNode = createBlockNode(chartBinding, bus, defaultSlotId, defaultContext);

    expect(tableNode.name).toBe("eln.table");
    expect(chartNode.name).toBe("eln.chart");
  });
});

// ── TipTapRenderer (integration) ────────────────────────────────────────

describe("TipTapRenderer", () => {
  let bus: WorkspaceBus;

  beforeEach(() => {
    bus = new WorkspaceBus();
  });

  // ── Empty / no bindings ──────────────────────────────────────────────

  it("renders nothing when bindings is empty", () => {
    const { container } = render(
      <TipTapRenderer
        slotId={defaultSlotId}
        bindings={[]}
        bus={bus}
        context={defaultContext}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  // ── Editor creation ──────────────────────────────────────────────────

  it("renders a TipTap editor with contenteditable when bindings are provided", async () => {
    const bindings: BlockBinding[] = [
      makeBlockBinding({
        id: "eln.table",
        label: "Table",
        component: TestBlock,
      }),
    ];

    render(
      <TipTapRenderer
        slotId={defaultSlotId}
        bindings={bindings}
        bus={bus}
        context={defaultContext}
      />,
    );

    await waitFor(() => {
      const editorElement = document.querySelector(
        ".tiptap-renderer [contenteditable]",
      );
      expect(editorElement).toBeTruthy();
    });
  });

  it("calls onCreate with the editor instance", async () => {
    const capture = captureEditor();
    const bindings: BlockBinding[] = [
      makeBlockBinding({
        id: "eln.table",
        label: "Table",
        component: TestBlock,
      }),
    ];

    render(
      <TipTapRenderer
        slotId={defaultSlotId}
        bindings={bindings}
        bus={bus}
        context={defaultContext}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onCreate={(capture as any).onCreate}
      />,
    );

    await waitFor(() => {
      expect(capture.editor).toBeTruthy();
    });

    expect(capture.editor).not.toBeNull();
  });

  it("editor schema includes block node types", async () => {
    const capture = captureEditor();
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
      <TipTapRenderer
        slotId={defaultSlotId}
        bindings={bindings}
        bus={bus}
        context={defaultContext}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onCreate={(capture as any).onCreate}
      />,
    );

    await waitFor(() => {
      expect(capture.editor).toBeTruthy();
    });

    // Both block types should be in the schema
    const schema = capture.editor!.schema;
    expect(schema.nodes["eln.table"]).toBeDefined();
    expect(schema.nodes["eln.chart"]).toBeDefined();

    // Standard nodes should still be present (from StarterKit)
    expect(schema.nodes["paragraph"]).toBeDefined();
    expect(schema.nodes["doc"]).toBeDefined();
  });

  // ── Lifecycle: created ──────────────────────────────────────────────

  it("emits created event when a block node is inserted", async () => {
    const createdPayloads: unknown[] = [];
    bus.on("eln.table.created", (payload) => {
      createdPayloads.push(payload);
    });

    const capture = captureEditor();
    const bindings: BlockBinding[] = [
      makeBlockBinding({
        id: "eln.table",
        label: "Table",
        component: TestBlock,
      }),
    ];

    render(
      <TipTapRenderer
        slotId={defaultSlotId}
        bindings={bindings}
        bus={bus}
        context={defaultContext}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onCreate={(capture as any).onCreate}
      />,
    );

    await waitFor(() => {
      expect(capture.editor).toBeTruthy();
    });

    // Insert a block node via the editor commands
    await act(async () => {
      const editor = capture.editor!;
      editor.commands.setContent({
        type: "doc",
        content: [
          {
            type: "eln.table",
            attrs: {
              content: JSON.stringify({ rows: 3, cols: 2 }),
            },
          },
        ],
      });
      // Allow ProseMirror to commit the transaction and NodeView to mount
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(createdPayloads.length).toBeGreaterThanOrEqual(1);
    const payload = createdPayloads[0] as Record<string, unknown>;
    expect(payload.blockId).toBe("eln.table");
    expect(payload.slotId).toBe(defaultSlotId);
    expect(payload.blockInstanceId).toBeTruthy();
  });

  // ── Lifecycle: edited ───────────────────────────────────────────────

  it("emits edited event when block content changes via updateAttrs", async () => {
    const editedPayloads: unknown[] = [];
    bus.on("eln.table.edited", (payload) => {
      editedPayloads.push(payload);
    });

    const capture = captureEditor();
    const bindings: BlockBinding[] = [
      makeBlockBinding({
        id: "eln.table",
        label: "Table",
        component: TestBlock,
      }),
    ];

    render(
      <TipTapRenderer
        slotId={defaultSlotId}
        bindings={bindings}
        bus={bus}
        context={defaultContext}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onCreate={(capture as any).onCreate}
      />,
    );

    await waitFor(() => {
      expect(capture.editor).toBeTruthy();
    });

    // Insert a block node
    await act(async () => {
      capture.editor!.commands.setContent({
        type: "doc",
        content: [
          {
            type: "eln.table",
            attrs: {
              content: JSON.stringify({ rows: 3 }),
            },
          },
        ],
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Track created events for reference (not used in assertions below)
    const createdPayloads: unknown[] = [];
    bus.on("eln.table.created", (p) => createdPayloads.push(p));

    // Update content via editor command — simulates block's updateAttrs
    await act(async () => {
      const editor = capture.editor!;
      const { state } = editor;
      const { tr } = state;
      let pos: number | null = null;

      // Find the block node position
      state.doc.descendants((node, p) => {
        if (node.type.name === "eln.table" && pos === null) {
          pos = p;
        }
        return pos === null;
      });

      if (pos !== null) {
        const updatedTr = tr.setNodeAttribute(
          pos,
          "content",
          JSON.stringify({ rows: 5 }), // changed content
        );
        editor.view.dispatch(updatedTr);
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(editedPayloads.length).toBeGreaterThanOrEqual(1);
    const payload = editedPayloads[0] as Record<string, unknown>;
    expect(payload.blockId).toBe("eln.table");
    expect(payload.blockInstanceId).toBeTruthy();
    expect(payload.changedAttrs).toEqual({ rows: 5 });
  });

  it("updateAttrs merges partial updates with existing state", async () => {
    const editedPayloads: unknown[] = [];
    bus.on("eln.table.edited", (payload) => {
      editedPayloads.push(payload);
    });

    const capture = captureEditor();
    const bindings: BlockBinding[] = [
      makeBlockBinding({
        id: "eln.table",
        label: "Table",
        component: TestBlock,
      }),
    ];

    render(
      <TipTapRenderer
        slotId={defaultSlotId}
        bindings={bindings}
        bus={bus}
        context={defaultContext}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onCreate={(capture as any).onCreate}
      />,
    );

    await waitFor(() => {
      expect(capture.editor).toBeTruthy();
    });

    // Insert a block with multi-field content
    await act(async () => {
      capture.editor!.commands.setContent({
        type: "doc",
        content: [
          {
            type: "eln.table",
            attrs: {
              content: JSON.stringify({ title: "My Table", rows: 3, cols: 2 }),
            },
          },
        ],
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Trigger a partial update via the TestBlock's update button.
    // TestBlock calls updateAttrs({ updated: true }) — if merging works,
    // the serialized content should still contain title, rows, and cols.
    await act(async () => {
      const btn = document.querySelector(
        '[data-testid="update-attrs-btn-eln.table"]',
      );
      btn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // The edited event payload carries changedAttrs — the full deserialized
    // state after the update. With the merge fix, it should preserve all
    // existing fields AND include the new partial field.
    expect(editedPayloads.length).toBeGreaterThanOrEqual(1);
    const payload = editedPayloads[0] as Record<string, unknown>;
    const changedAttrs = payload.changedAttrs as Record<string, unknown>;
    expect(changedAttrs.title).toBe("My Table");
    expect(changedAttrs.rows).toBe(3);
    expect(changedAttrs.cols).toBe(2);
    expect(changedAttrs.updated).toBe(true);
  });

  // ── Lifecycle: deleted ──────────────────────────────────────────────

  it("emits deleted event when a block node is removed", async () => {
    const deletedPayloads: unknown[] = [];
    bus.on("eln.table.deleted", (payload) => {
      deletedPayloads.push(payload);
    });

    const capture = captureEditor();
    const bindings: BlockBinding[] = [
      makeBlockBinding({
        id: "eln.table",
        label: "Table",
        component: TestBlock,
      }),
    ];

    render(
      <TipTapRenderer
        slotId={defaultSlotId}
        bindings={bindings}
        bus={bus}
        context={defaultContext}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onCreate={(capture as any).onCreate}
      />,
    );

    await waitFor(() => {
      expect(capture.editor).toBeTruthy();
    });

    // Insert a block node
    await act(async () => {
      capture.editor!.commands.setContent({
        type: "doc",
        content: [
          {
            type: "eln.table",
            attrs: {
              content: JSON.stringify({ rows: 3 }),
            },
          },
        ],
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Delete the block node
    await act(async () => {
      // Clear all content — removes the block node
      capture.editor!.commands.clearContent();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(deletedPayloads.length).toBeGreaterThanOrEqual(1);
    const payload = deletedPayloads[0] as Record<string, unknown>;
    expect(payload.blockId).toBe("eln.table");
    expect(payload.blockInstanceId).toBeTruthy();
  });

  // ── Event routing: listensTo → onEvent ──────────────────────────────

  it("subscribes to bus.on() for listensTo events and routes to onEvent handler", async () => {
    const onEventHandler = vi.fn(
      (_instance: unknown, payload: unknown) => payload,
    );
    const capture = captureEditor();
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
      <TipTapRenderer
        slotId={defaultSlotId}
        bindings={bindings}
        bus={bus}
        context={defaultContext}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onCreate={(capture as any).onCreate}
      />,
    );

    await waitFor(() => {
      expect(capture.editor).toBeTruthy();
    });

    // Insert a block node so the NodeView exists with bus subscriptions
    await act(async () => {
      capture.editor!.commands.setContent({
        type: "doc",
        content: [
          {
            type: "eln.table",
            attrs: {
              content: JSON.stringify({ rows: 3 }),
            },
          },
        ],
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Now emit an event on the bus — the NodeView should route it to onEvent
    bus.emit("data.export", { format: "csv" });

    expect(onEventHandler).toHaveBeenCalledTimes(1);
    expect(onEventHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        blockId: "eln.table",
      }),
      { format: "csv" },
    );
  });

  it("onEvent handler return values are captured by bus.collect", async () => {
    const onEventHandler = vi.fn(
      async (_instance: unknown, payload: unknown) => {
        return `exported: ${(payload as { format: string }).format}`;
      },
    );
    const capture = captureEditor();
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
      <TipTapRenderer
        slotId={defaultSlotId}
        bindings={bindings}
        bus={bus}
        context={defaultContext}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onCreate={(capture as any).onCreate}
      />,
    );

    await waitFor(() => {
      expect(capture.editor).toBeTruthy();
    });

    await act(async () => {
      capture.editor!.commands.setContent({
        type: "doc",
        content: [
          {
            type: "eln.table",
            attrs: { content: JSON.stringify({}) },
          },
        ],
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const results = await bus.collect("data.export", { format: "csv" });

    expect(results).toEqual(["exported: csv"]);
  });

  it("onEvent handler receives current instance attrs", async () => {
    const receivedAttrs: unknown[] = [];
    const onEventHandler = vi.fn(
      (instance: { attrs: unknown }) => {
        receivedAttrs.push(instance.attrs);
      },
    );
    const capture = captureEditor();
    const bindings: BlockBinding[] = [
      makeBlockBinding({
        id: "eln.table",
        label: "Table",
        component: TestBlock,
        listensTo: ["data.export"],
        onEvent: { "data.export": onEventHandler },
        defaultState: { rows: 10, cols: 5 },
      }),
    ];

    render(
      <TipTapRenderer
        slotId={defaultSlotId}
        bindings={bindings}
        bus={bus}
        context={defaultContext}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onCreate={(capture as any).onCreate}
      />,
    );

    await waitFor(() => {
      expect(capture.editor).toBeTruthy();
    });

    await act(async () => {
      capture.editor!.commands.setContent({
        type: "doc",
        content: [
          {
            type: "eln.table",
            attrs: {
              content: JSON.stringify({ rows: 10, cols: 5 }),
            },
          },
        ],
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    bus.emit("data.export", {});
    expect(receivedAttrs).toEqual([{ rows: 10, cols: 5 }]);
  });

  // ── Cleanup ──────────────────────────────────────────────────────────

  it("cleans up editor DOM on unmount", async () => {
    const bindings: BlockBinding[] = [
      makeBlockBinding({
        id: "eln.table",
        label: "Table",
        component: TestBlock,
      }),
    ];

    const { unmount } = render(
      <TipTapRenderer
        slotId={defaultSlotId}
        bindings={bindings}
        bus={bus}
        context={defaultContext}
      />,
    );

    await waitFor(() => {
      expect(
        document.querySelector(".tiptap-renderer [contenteditable]"),
      ).toBeTruthy();
    });

    unmount();

    expect(
      document.querySelector(".tiptap-renderer [contenteditable]"),
    ).toBeNull();
  });

  it("cleans up bus subscriptions on unmount", async () => {
    const onEventHandler = vi.fn();
    const capture = captureEditor();
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
      <TipTapRenderer
        slotId={defaultSlotId}
        bindings={bindings}
        bus={bus}
        context={defaultContext}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onCreate={(capture as any).onCreate}
      />,
    );

    await waitFor(() => {
      expect(capture.editor).toBeTruthy();
    });

    // Insert a block so NodeView exists
    await act(async () => {
      capture.editor!.commands.setContent({
        type: "doc",
        content: [
          {
            type: "eln.table",
            attrs: { content: JSON.stringify({}) },
          },
        ],
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Verify subscriptions are active
    bus.emit("data.export", {});
    expect(onEventHandler).toHaveBeenCalledTimes(1);

    unmount();

    // After unmount, bus events should not reach the handler
    bus.emit("data.export", {});
    expect(onEventHandler).toHaveBeenCalledTimes(1); // still 1
  });

  // ── BlockComponentProps: context ─────────────────────────────────────

  it("passes context to the block component via BlockComponentProps", async () => {
    const capture = captureEditor();
    const customContext: SlotContext = {
      workspaceId: "lims",
      user: { id: "u2", name: "LIMS User" },
      viewMode: "view",
      entityId: "entity-1",
    };

    const bindings: BlockBinding[] = [
      makeBlockBinding({
        id: "eln.table",
        label: "Table",
        component: TestBlock,
      }),
    ];

    render(
      <TipTapRenderer
        slotId="lims.editor"
        bindings={bindings}
        bus={bus}
        context={customContext}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onCreate={(capture as any).onCreate}
      />,
    );

    await waitFor(() => {
      expect(capture.editor).toBeTruthy();
    });

    await act(async () => {
      capture.editor!.commands.setContent({
        type: "doc",
        content: [
          {
            type: "eln.table",
            attrs: { content: JSON.stringify({}) },
          },
        ],
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // The TestBlock component renders the workspaceId from context
    await waitFor(() => {
      const el = document.querySelector(
        '[data-testid="block-context-workspace-eln.table"]',
      );
      expect(el).toBeTruthy();
    });
  });

  // ── Multiple bindings ────────────────────────────────────────────────

  it("filters to only bindings with events they actually listen to", async () => {
    const tableHandler = vi.fn();
    const chartHandler = vi.fn();
    const capture = captureEditor();
    const bindings: BlockBinding[] = [
      makeBlockBinding({
        id: "eln.table",
        label: "Table",
        component: TestBlock,
        listensTo: ["data.export"],
        onEvent: { "data.export": tableHandler },
      }),
      makeBlockBinding({
        id: "eln.chart",
        label: "Chart",
        component: TestBlock,
        listensTo: ["entry.saved"],
        onEvent: { "entry.saved": chartHandler },
        order: 1,
      }),
    ];

    render(
      <TipTapRenderer
        slotId={defaultSlotId}
        bindings={bindings}
        bus={bus}
        context={defaultContext}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onCreate={(capture as any).onCreate}
      />,
    );

    await waitFor(() => {
      expect(capture.editor).toBeTruthy();
    });

    // Insert both blocks
    await act(async () => {
      capture.editor!.commands.setContent({
        type: "doc",
        content: [
          {
            type: "eln.table",
            attrs: { content: JSON.stringify({}) },
          },
          {
            type: "eln.chart",
            attrs: { content: JSON.stringify({}) },
          },
        ],
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Fire export event — only table should respond
    bus.emit("data.export", {});
    expect(tableHandler).toHaveBeenCalledTimes(1);
    expect(chartHandler).not.toHaveBeenCalled();

    // Fire save event — only chart should respond
    bus.emit("entry.saved", {});
    expect(tableHandler).toHaveBeenCalledTimes(1); // still 1
    expect(chartHandler).toHaveBeenCalledTimes(1);
  });

  // ── Editor content persistence ───────────────────────────────────────

  it("editor starts empty (single empty paragraph) when no content provided", async () => {
    const capture = captureEditor();
    const bindings: BlockBinding[] = [
      makeBlockBinding({
        id: "eln.table",
        label: "Table",
        component: TestBlock,
      }),
    ];

    render(
      <TipTapRenderer
        slotId={defaultSlotId}
        bindings={bindings}
        bus={bus}
        context={defaultContext}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onCreate={(capture as any).onCreate}
      />,
    );

    await waitFor(() => {
      expect(capture.editor).toBeTruthy();
    });

    // Empty doc should have just a paragraph node
    const doc = capture.editor!.state.doc;
    expect(doc.childCount).toBe(1); // paragraph is a child of doc
    expect(doc.firstChild?.type.name).toBe("paragraph");
  });
});
