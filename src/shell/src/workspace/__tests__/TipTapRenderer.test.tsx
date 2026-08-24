import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import { TipTapRenderer } from "../TipTapRenderer/TipTapRenderer";
import { createBlockNode } from "../TipTapRenderer/createBlockNode";
import { WorkspaceBus } from "../WorkspaceBus";
import { BlockEvent } from "../../mod-system/BlockEvent";
import type {
  BlockBinding,
  SlotContext,
  BlockComponentProps,
} from "../../mod-system/types";
import { Node } from "@tiptap/core";
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
    emits: [],
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

  it("marks dynamic-bleed blocks at the workspace seam", async () => {
    const capture = captureEditor();
    const bindings: BlockBinding[] = [
      makeBlockBinding({
        component: TestBlock,
        layout: "dynamic-bleed",
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

    await waitFor(() => expect(capture.editor).toBeTruthy());
    await act(async () => {
      capture.editor!.commands.setContent({
        type: "doc",
        content: [{ type: "eln.table", attrs: { content: "{}" } }],
      });
    });

    await waitFor(() => {
      const marker = document.querySelector('[data-layout="dynamic-bleed"]');
      expect(marker).toBeTruthy();
      expect(marker?.parentElement).toHaveClass("react-renderer");
    });
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

  // ── Action accumulator: onFlushActions called on saveSignal change ──

  it("calls onFlushActions when saveSignal transitions after lifecycle events", async () => {
    const mockFlush = vi.fn().mockResolvedValue(undefined);
    const capture = captureEditor();
    const bindings: BlockBinding[] = [
      makeBlockBinding({
        id: "eln.table",
        label: "Table",
        component: TestBlock,
      }),
    ];

    let saveSignal: Date | null = null;
    const { rerender } = render(
      <TipTapRenderer
        slotId={defaultSlotId}
        bindings={bindings}
        bus={bus}
        context={defaultContext}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onCreate={(capture as any).onCreate}
        onFlushActions={mockFlush}
        saveSignal={saveSignal}
        targetId={42}
      />,
    );

    await waitFor(() => {
      expect(capture.editor).toBeTruthy();
    });

    // Insert a block node to trigger lifecycle events
    await act(async () => {
      capture.editor!.commands.setContent({
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
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Flush has not been called yet — no saveSignal transition
    expect(mockFlush).not.toHaveBeenCalled();

    // Trigger save by changing saveSignal from null → Date
    saveSignal = new Date();
    rerender(
      <TipTapRenderer
        slotId={defaultSlotId}
        bindings={bindings}
        bus={bus}
        context={defaultContext}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onCreate={(capture as any).onCreate}
        onFlushActions={mockFlush}
        saveSignal={saveSignal}
        targetId={42}
      />,
    );

    // The initial null → Date transition is skipped (initial load, not save).
    // Wait a tick then trigger a second save.
    await new Promise((resolve) => setTimeout(resolve, 10));
    const secondSignal = new Date();
    rerender(
      <TipTapRenderer
        slotId={defaultSlotId}
        bindings={bindings}
        bus={bus}
        context={defaultContext}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onCreate={(capture as any).onCreate}
        onFlushActions={mockFlush}
        saveSignal={secondSignal}
        targetId={42}
      />,
    );

    await vi.waitFor(() => {
      expect(mockFlush).toHaveBeenCalled();
    });

    // Verify sendAction was called with correct arguments
    expect(mockFlush).toHaveBeenCalledWith(
      "eln.table.created",
      "eln.entry",
      42,
      { message: "eln.table.created" },
      expect.any(String),
    );
  });

  // ── Action accumulator: dedup by (blockInstanceId, verb) ─────────────

  it("deduplicates lifecycle events by blockInstanceId and verb", async () => {
    const mockFlush = vi.fn().mockResolvedValue(undefined);
    const capture = captureEditor();
    const bindings: BlockBinding[] = [
      makeBlockBinding({
        id: "eln.table",
        label: "Table",
        component: TestBlock,
      }),
    ];

    let saveSignal: Date | null = new Date(); // non-null initial so first transition is skipped
    const { rerender } = render(
      <TipTapRenderer
        slotId={defaultSlotId}
        bindings={bindings}
        bus={bus}
        context={defaultContext}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onCreate={(capture as any).onCreate}
        onFlushActions={mockFlush}
        saveSignal={saveSignal}
        targetId={42}
      />,
    );

    await waitFor(() => {
      expect(capture.editor).toBeTruthy();
    });

    // Insert a block and edit it multiple times
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

    // Edit the block twice
    await act(async () => {
      const editor = capture.editor!;
      const { state } = editor;
      let pos: number | null = null;
      state.doc.descendants((node, p) => {
        if (node.type.name === "eln.table" && pos === null) pos = p;
        return pos === null;
      });
      if (pos !== null) {
        editor.view.dispatch(
          state.tr.setNodeAttribute(pos, "content", JSON.stringify({ rows: 5 })),
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    await act(async () => {
      const editor = capture.editor!;
      const { state } = editor;
      let pos: number | null = null;
      state.doc.descendants((node, p) => {
        if (node.type.name === "eln.table" && pos === null) pos = p;
        return pos === null;
      });
      if (pos !== null) {
        editor.view.dispatch(
          state.tr.setNodeAttribute(pos, "content", JSON.stringify({ rows: 7 })),
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Trigger flush
    saveSignal = new Date();
    rerender(
      <TipTapRenderer
        slotId={defaultSlotId}
        bindings={bindings}
        bus={bus}
        context={defaultContext}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onCreate={(capture as any).onCreate}
        onFlushActions={mockFlush}
        saveSignal={saveSignal}
        targetId={42}
      />,
    );

    await vi.waitFor(() => {
      expect(mockFlush).toHaveBeenCalled();
    });

    // Should have 2 calls: created + edited (deduplicated to one edit)
    expect(mockFlush).toHaveBeenCalledTimes(2);
    const actionTypes = mockFlush.mock.calls.map((c: unknown[]) => c[0]);
    expect(actionTypes).toContain("eln.table.created");
    expect(actionTypes).toContain("eln.table.edited");
  });

  // ── Action accumulator: no flush without targetId ────────────────────

  it("does not call onFlushActions when targetId is absent", async () => {
    const mockFlush = vi.fn().mockResolvedValue(undefined);
    const capture = captureEditor();
    const bindings: BlockBinding[] = [
      makeBlockBinding({
        id: "eln.table",
        label: "Table",
        component: TestBlock,
      }),
    ];

    let saveSignal: Date | null = new Date();
    const { rerender } = render(
      <TipTapRenderer
        slotId={defaultSlotId}
        bindings={bindings}
        bus={bus}
        context={defaultContext}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onCreate={(capture as any).onCreate}
        onFlushActions={mockFlush}
        saveSignal={saveSignal}
        targetId={undefined}
      />,
    );

    await waitFor(() => {
      expect(capture.editor).toBeTruthy();
    });

    // Insert a block
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

    // Trigger flush with no targetId
    saveSignal = new Date();
    rerender(
      <TipTapRenderer
        slotId={defaultSlotId}
        bindings={bindings}
        bus={bus}
        context={defaultContext}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onCreate={(capture as any).onCreate}
        onFlushActions={mockFlush}
        saveSignal={saveSignal}
        targetId={undefined}
      />,
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockFlush).not.toHaveBeenCalled();
  });

  // ── Action accumulator: bus event on successful flush ────────────────

  it("emits {workspaceId}.action.performed on successful flush", async () => {
    const mockFlush = vi.fn().mockResolvedValue(undefined);
    const actionPerformedPayloads: unknown[] = [];
    bus.on("eln.action.performed", (payload) => {
      actionPerformedPayloads.push(payload);
    });

    const capture = captureEditor();
    const bindings: BlockBinding[] = [
      makeBlockBinding({
        id: "eln.table",
        label: "Table",
        component: TestBlock,
      }),
    ];

    let saveSignal: Date | null = new Date();
    const { rerender } = render(
      <TipTapRenderer
        slotId={defaultSlotId}
        bindings={bindings}
        bus={bus}
        context={defaultContext}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onCreate={(capture as any).onCreate}
        onFlushActions={mockFlush}
        saveSignal={saveSignal}
        targetId={42}
      />,
    );

    await waitFor(() => {
      expect(capture.editor).toBeTruthy();
    });

    // Insert a block
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

    // Trigger flush
    saveSignal = new Date();
    rerender(
      <TipTapRenderer
        slotId={defaultSlotId}
        bindings={bindings}
        bus={bus}
        context={defaultContext}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onCreate={(capture as any).onCreate}
        onFlushActions={mockFlush}
        saveSignal={saveSignal}
        targetId={42}
      />,
    );

    await vi.waitFor(() => {
      expect(actionPerformedPayloads.length).toBeGreaterThanOrEqual(1);
    });

    const payload = actionPerformedPayloads[0] as Record<string, unknown>;
    expect(payload.action).toBe("eln.table.created");
    expect(payload.actionType).toBe("created");
    expect(payload.targetId).toBe(42);
    expect(payload.targetType).toBe("eln.entry");
    expect(payload.requestId).toEqual(expect.any(String));
    expect(payload.performedBy).toBe(defaultContext.user);
    expect(payload.createdAt).toEqual(expect.any(String));
    expect(payload.label).toEqual(expect.any(String));
  });

  // ── Action accumulator: no bus event on flush failure ────────────────

  it("does not emit {workspaceId}.action.performed when flush fails", async () => {
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    const mockFlush = vi.fn().mockRejectedValue(new Error("Network error"));
    const actionPerformedPayloads: unknown[] = [];
    bus.on("eln.action.performed", (payload) => {
      actionPerformedPayloads.push(payload);
    });

    const capture = captureEditor();
    const bindings: BlockBinding[] = [
      makeBlockBinding({
        id: "eln.table",
        label: "Table",
        component: TestBlock,
      }),
    ];

    let saveSignal: Date | null = new Date();
    const { rerender } = render(
      <TipTapRenderer
        slotId={defaultSlotId}
        bindings={bindings}
        bus={bus}
        context={defaultContext}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onCreate={(capture as any).onCreate}
        onFlushActions={mockFlush}
        saveSignal={saveSignal}
        targetId={42}
      />,
    );

    await waitFor(() => {
      expect(capture.editor).toBeTruthy();
    });

    // Insert a block
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

    // Trigger flush
    saveSignal = new Date();
    rerender(
      <TipTapRenderer
        slotId={defaultSlotId}
        bindings={bindings}
        bus={bus}
        context={defaultContext}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onCreate={(capture as any).onCreate}
        onFlushActions={mockFlush}
        saveSignal={saveSignal}
        targetId={42}
      />,
    );

    await vi.waitFor(() => {
      expect(mockFlush).toHaveBeenCalled();
    });

    // No action.performed events should have been emitted
    expect(actionPerformedPayloads.length).toBe(0);
    expect(consoleWarnSpy).toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
  });

  it("updateAttrs merges partial updates with existing state", async () => {
    const mockFlush = vi.fn().mockResolvedValue(undefined);
    const capture = captureEditor();
    const bindings: BlockBinding[] = [
      makeBlockBinding({
        id: "eln.table",
        label: "Table",
        component: TestBlock,
      }),
    ];

    // Start with non-null saveSignal so the initial transition is skipped
    const saveSignal: Date | null = new Date();
    render(
      <TipTapRenderer
        slotId={defaultSlotId}
        bindings={bindings}
        bus={bus}
        context={defaultContext}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onCreate={(capture as any).onCreate}
        onFlushActions={mockFlush}
        saveSignal={saveSignal}
        targetId={42}
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

    // Verify the DOM shows merged attrs
    const attrsEl = document.querySelector(
      '[data-testid="block-attrs-eln.table"]',
    );
    expect(attrsEl).toBeTruthy();
    const attrs = JSON.parse(attrsEl!.textContent || "{}");
    expect(attrs.title).toBe("My Table");
    expect(attrs.rows).toBe(3);
    expect(attrs.cols).toBe(2);
    expect(attrs.updated).toBe(true);
  });

  // ── rAF startup suppression gate (#367) ───────────────────────────────

  it("suppresses lifecycle accumulation before the first animation frame", async () => {
    // Capture all rAF callbacks so we can release suppression on demand.
    // React 19 itself may use rAF internally, so we collect every callback
    // and fire them all at once rather than assuming a single registration.
    const rafCallbacks: Array<() => void> = [];
    vi.stubGlobal(
      "requestAnimationFrame",
      (cb: FrameRequestCallback) => {
        rafCallbacks.push(() => cb(0));
        return rafCallbacks.length;
      },
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const mockFlush = vi.fn().mockResolvedValue(undefined);
    const capture = captureEditor();
    const bindings: BlockBinding[] = [
      makeBlockBinding({
        id: "eln.table",
        label: "Table",
        component: TestBlock,
      }),
    ];

    let saveSignal: Date | null = new Date();
    const { rerender } = render(
      <TipTapRenderer
        slotId={defaultSlotId}
        bindings={bindings}
        bus={bus}
        context={defaultContext}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onCreate={(capture as any).onCreate}
        onFlushActions={mockFlush}
        saveSignal={saveSignal}
        targetId={42}
      />,
    );

    await waitFor(() => {
      expect(capture.editor).toBeTruthy();
    });

    // At least one rAF should have been registered (our suppression gate).
    expect(rafCallbacks.length).toBeGreaterThan(0);

    // Insert a block while rAF suppression is still active.
    // The created/edited lifecycle events from the NodeView mount should
    // be suppressed — suppressRef is still true.
    await act(async () => {
      capture.editor!.commands.setContent({
        type: "doc",
        content: [
          {
            type: "eln.table",
            attrs: { content: JSON.stringify({ rows: 3 }) },
          },
        ],
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Release all rAF callbacks — the suppression gate flips to false
    act(() => {
      for (const cb of rafCallbacks) {
        cb();
      }
      rafCallbacks.length = 0;
    });

    // Edit the block after suppression release — should be accumulated
    await act(async () => {
      const editor = capture.editor!;
      const { state } = editor;
      let pos: number | null = null;
      state.doc.descendants((node, p) => {
        if (node.type.name === "eln.table" && pos === null) pos = p;
        return pos === null;
      });
      if (pos !== null) {
        editor.view.dispatch(
          state.tr.setNodeAttribute(
            pos,
            "content",
            JSON.stringify({ rows: 5 }),
          ),
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Trigger flush
    saveSignal = new Date();
    rerender(
      <TipTapRenderer
        slotId={defaultSlotId}
        bindings={bindings}
        bus={bus}
        context={defaultContext}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onCreate={(capture as any).onCreate}
        onFlushActions={mockFlush}
        saveSignal={saveSignal}
        targetId={42}
      />,
    );

    await vi.waitFor(() => {
      expect(mockFlush).toHaveBeenCalled();
    });

    // Only the "edited" event from after rAF release should be accumulated;
    // the "created" event was suppressed.
    expect(mockFlush).toHaveBeenCalledTimes(1);
    expect(mockFlush).toHaveBeenCalledWith(
      "eln.table.edited",
      "eln.entry",
      42,
      { message: "eln.table.edited" },
      expect.any(String),
    );

    vi.unstubAllGlobals();
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

  // ── New props: extensions, onUpdate, editable ──────────────────────────

  it("merges passed extensions with internal StarterKit and block nodes", async () => {
    const TestNode = Node.create({
      name: "testCustomNode",
      group: "block",
      content: "inline*",
      parseHTML() {
        return [{ tag: "test-node" }];
      },
      renderHTML() {
        return ["test-node", {}, 0];
      },
    });

    const capture = captureEditor();
    const bindings: BlockBinding[] = [
      makeBlockBinding({ id: "eln.table", component: TestBlock }),
    ];

    render(
      <TipTapRenderer
        slotId={defaultSlotId}
        bindings={bindings}
        bus={bus}
        context={defaultContext}
        extensions={[TestNode]}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onCreate={(capture as any).onCreate}
      />,
    );

    await waitFor(() => {
      expect(capture.editor).toBeTruthy();
    });

    const schema = capture.editor!.schema;
    expect(schema.nodes["testCustomNode"]).toBeDefined();
    expect(schema.nodes["eln.table"]).toBeDefined();
    expect(schema.nodes["paragraph"]).toBeDefined();
  });

  it("calls onUpdate when editor content changes", async () => {
    const onUpdate = vi.fn();
    const capture = captureEditor();
    const bindings: BlockBinding[] = [
      makeBlockBinding({ id: "eln.table", component: TestBlock }),
    ];

    render(
      <TipTapRenderer
        slotId={defaultSlotId}
        bindings={bindings}
        bus={bus}
        context={defaultContext}
        onUpdate={onUpdate}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onCreate={(capture as any).onCreate}
      />,
    );

    await waitFor(() => {
      expect(capture.editor).toBeTruthy();
    });

    const initialCalls = onUpdate.mock.calls.length;

    await act(async () => {
      capture.editor!.commands.insertContent("Hello world");
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(onUpdate.mock.calls.length).toBeGreaterThan(initialCalls);
    const lastCall = onUpdate.mock.calls[onUpdate.mock.calls.length - 1];
    expect(lastCall[0]).toBeTruthy();
  });

  it("disables input when editable is false", async () => {
    const bindings: BlockBinding[] = [
      makeBlockBinding({ id: "eln.table", component: TestBlock }),
    ];

    render(
      <TipTapRenderer
        slotId={defaultSlotId}
        bindings={bindings}
        bus={bus}
        context={defaultContext}
        editable={false}
      />,
    );

    await waitFor(() => {
      const editorElement = document.querySelector(
        ".tiptap-renderer [contenteditable]",
      );
      expect(editorElement).toBeTruthy();
      expect(editorElement!.getAttribute("contenteditable")).toBe("false");
    });
  });

  it("enables input when editable is not passed (defaults to true)", async () => {
    const bindings: BlockBinding[] = [
      makeBlockBinding({ id: "eln.table", component: TestBlock }),
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
      expect(editorElement!.getAttribute("contenteditable")).toBe("true");
    });
  });

  // ── Action accumulator: custom domain actions via emits ─────────────

  describe("custom domain actions (emits)", () => {
    it("accumulates and flushes custom actions from bus events matching blockId.*", async () => {
      const mockFlush = vi.fn().mockResolvedValue(undefined);
      const capture = captureEditor();
      const bindings: BlockBinding[] = [
        makeBlockBinding({
          id: "eln.registry-table",
          label: "Registry Table",
          component: TestBlock,
          emits: [
            BlockEvent.action({ id: "row-added", core: "created" }),
          ],
        }),
      ];

      let saveSignal: Date | null = new Date(); // non-null initial so first transition is skipped
      const { rerender } = render(
        <TipTapRenderer
          slotId={defaultSlotId}
          bindings={bindings}
          bus={bus}
          context={defaultContext}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onCreate={(capture as any).onCreate}
          onFlushActions={mockFlush}
          saveSignal={saveSignal}
          targetId={42}
        />,
      );

      await waitFor(() => {
        expect(capture.editor).toBeTruthy();
      });

      // Wait for the rAF suppression gate to release.
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Simulate a block calling context.emitAction("row-added", { rowCount: 3 })
      // by emitting directly on the bus as the renderer would.
      bus.emit("eln.registry-table.row-added", {
        blockInstanceId: "eln.registry-table::0",
        blockId: "eln.registry-table",
        localId: "row-added",
        payload: { rowCount: 3 },
      });

      // Trigger flush
      saveSignal = new Date();
      rerender(
        <TipTapRenderer
          slotId={defaultSlotId}
          bindings={bindings}
          bus={bus}
          context={defaultContext}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onCreate={(capture as any).onCreate}
          onFlushActions={mockFlush}
          saveSignal={saveSignal}
          targetId={42}
        />,
      );

      await vi.waitFor(() => {
        expect(mockFlush).toHaveBeenCalled();
      });

      // Verify the custom action was flushed with the correct metadata.
      // The label is resolved from the backend action catalog; when no catalog
      // entry exists (as in this test), it falls back to the raw action string.
      const customActionCall = mockFlush.mock.calls.find(
        (c: unknown[]) => c[0] === "eln.registry-table.row-added",
      );
      expect(customActionCall).toBeDefined();
      expect(customActionCall![1]).toBe("eln.entry");
      expect(customActionCall![2]).toBe(42);
      expect(customActionCall![3]).toEqual({
        message: "eln.registry-table.row-added",
        rowCount: 3,
      });
    });

    it("uses fallback label when emit declaration is not found", async () => {
      const mockFlush = vi.fn().mockResolvedValue(undefined);
      const capture = captureEditor();
      const bindings: BlockBinding[] = [
        makeBlockBinding({
          id: "eln.registry-table",
          label: "Registry Table",
          component: TestBlock,
          emits: [
            BlockEvent.action({ id: "row-added", core: "created" }),
          ],
        }),
      ];

      let saveSignal: Date | null = new Date();
      const { rerender } = render(
        <TipTapRenderer
          slotId={defaultSlotId}
          bindings={bindings}
          bus={bus}
          context={defaultContext}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onCreate={(capture as any).onCreate}
          onFlushActions={mockFlush}
          saveSignal={saveSignal}
          targetId={42}
        />,
      );

      await waitFor(() => {
        expect(capture.editor).toBeTruthy();
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Emit an event whose localId doesn't match any emit declaration
      bus.emit("eln.registry-table.unknown-action", {
        blockInstanceId: "eln.registry-table::0",
        blockId: "eln.registry-table",
        localId: "unknown-action",
        payload: {},
      });

      saveSignal = new Date();
      rerender(
        <TipTapRenderer
          slotId={defaultSlotId}
          bindings={bindings}
          bus={bus}
          context={defaultContext}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onCreate={(capture as any).onCreate}
          onFlushActions={mockFlush}
          saveSignal={saveSignal}
          targetId={42}
        />,
      );

      await vi.waitFor(() => {
        expect(mockFlush).toHaveBeenCalled();
      });

      // Should fall back to action string as label and "created" as core
      const customActionCall = mockFlush.mock.calls.find(
        (c: unknown[]) => c[0] === "eln.registry-table.unknown-action",
      );
      expect(customActionCall).toBeDefined();
      expect(customActionCall![3]).toEqual({
        message: "eln.registry-table.unknown-action",
      });
    });

    it("does not subscribe to wildcards for bindings with empty emits", async () => {
      const mockFlush = vi.fn().mockResolvedValue(undefined);
      const capture = captureEditor();
      const bindings: BlockBinding[] = [
        makeBlockBinding({
          id: "eln.table",
          label: "Table",
          component: TestBlock,
          emits: [],
        }),
      ];

      let saveSignal: Date | null = new Date();
      const { rerender } = render(
        <TipTapRenderer
          slotId={defaultSlotId}
          bindings={bindings}
          bus={bus}
          context={defaultContext}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onCreate={(capture as any).onCreate}
          onFlushActions={mockFlush}
          saveSignal={saveSignal}
          targetId={42}
        />,
      );

      await waitFor(() => {
        expect(capture.editor).toBeTruthy();
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Emit an event matching the pattern — should be ignored (emits is empty)
      bus.emit("eln.table.row-added", {
        blockInstanceId: "eln.table::0",
        blockId: "eln.table",
        localId: "row-added",
        payload: {},
      });

      // Also trigger a lifecycle event so there's something to flush
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

      saveSignal = new Date();
      rerender(
        <TipTapRenderer
          slotId={defaultSlotId}
          bindings={bindings}
          bus={bus}
          context={defaultContext}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onCreate={(capture as any).onCreate}
          onFlushActions={mockFlush}
          saveSignal={saveSignal}
          targetId={42}
        />,
      );

      await vi.waitFor(() => {
        expect(mockFlush).toHaveBeenCalled();
      });

      // Only lifecycle events should be flushed, not the custom action
      const customActionCall = mockFlush.mock.calls.find(
        (c: unknown[]) => c[0] === "eln.table.row-added",
      );
      expect(customActionCall).toBeUndefined();
    });

    it("accumulates multiple custom actions alongside lifecycle events", async () => {
      const mockFlush = vi.fn().mockResolvedValue(undefined);
      const capture = captureEditor();
      const bindings: BlockBinding[] = [
        makeBlockBinding({
          id: "eln.registry-table",
          label: "Registry Table",
          component: TestBlock,
          emits: [
            BlockEvent.action({ id: "row-added", core: "created" }),
            BlockEvent.action({ id: "entities-registered", core: "created" }),
          ],
        }),
      ];

      let saveSignal: Date | null = new Date();
      const { rerender } = render(
        <TipTapRenderer
          slotId={defaultSlotId}
          bindings={bindings}
          bus={bus}
          context={defaultContext}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onCreate={(capture as any).onCreate}
          onFlushActions={mockFlush}
          saveSignal={saveSignal}
          targetId={42}
        />,
      );

      await waitFor(() => {
        expect(capture.editor).toBeTruthy();
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Emit two custom actions
      bus.emit("eln.registry-table.row-added", {
        blockInstanceId: "eln.registry-table::0",
        blockId: "eln.registry-table",
        localId: "row-added",
        payload: { rowCount: 3 },
      });

      bus.emit("eln.registry-table.entities-registered", {
        blockInstanceId: "eln.registry-table::0",
        blockId: "eln.registry-table",
        localId: "entities-registered",
        payload: { registeredCount: 3, totalAttempted: 3 },
      });

      saveSignal = new Date();
      rerender(
        <TipTapRenderer
          slotId={defaultSlotId}
          bindings={bindings}
          bus={bus}
          context={defaultContext}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onCreate={(capture as any).onCreate}
          onFlushActions={mockFlush}
          saveSignal={saveSignal}
          targetId={42}
        />,
      );

      await vi.waitFor(() => {
        expect(mockFlush).toHaveBeenCalled();
      });

      // Both custom actions should be flushed
      const actionTypes = mockFlush.mock.calls.map((c: unknown[]) => c[0]);
      expect(actionTypes).toContain("eln.registry-table.row-added");
      expect(actionTypes).toContain("eln.registry-table.entities-registered");
    });

    it("emits action.performed for custom actions on successful flush", async () => {
      const mockFlush = vi.fn().mockResolvedValue(undefined);
      const actionPerformedPayloads: unknown[] = [];
      bus.on("eln.action.performed", (payload) => {
        actionPerformedPayloads.push(payload);
      });

      const capture = captureEditor();
      const bindings: BlockBinding[] = [
        makeBlockBinding({
          id: "eln.registry-table",
          label: "Registry Table",
          component: TestBlock,
          emits: [
            BlockEvent.action({ id: "row-added", core: "created" }),
          ],
        }),
      ];

      let saveSignal: Date | null = new Date();
      const { rerender } = render(
        <TipTapRenderer
          slotId={defaultSlotId}
          bindings={bindings}
          bus={bus}
          context={defaultContext}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onCreate={(capture as any).onCreate}
          onFlushActions={mockFlush}
          saveSignal={saveSignal}
          targetId={42}
        />,
      );

      await waitFor(() => {
        expect(capture.editor).toBeTruthy();
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      bus.emit("eln.registry-table.row-added", {
        blockInstanceId: "eln.registry-table::0",
        blockId: "eln.registry-table",
        localId: "row-added",
        payload: { rowCount: 2 },
      });

      saveSignal = new Date();
      rerender(
        <TipTapRenderer
          slotId={defaultSlotId}
          bindings={bindings}
          bus={bus}
          context={defaultContext}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onCreate={(capture as any).onCreate}
          onFlushActions={mockFlush}
          saveSignal={saveSignal}
          targetId={42}
        />,
      );

      await vi.waitFor(() => {
        expect(actionPerformedPayloads.length).toBeGreaterThan(0);
      });

      // Verify the action.performed payload includes the custom action
      const customPerformed = actionPerformedPayloads.find(
        (p: unknown) =>
          (p as Record<string, unknown>).action === "eln.registry-table.row-added",
      );
      expect(customPerformed).toBeDefined();
    });
  });
});
