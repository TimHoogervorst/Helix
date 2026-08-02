import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SlotSidebar } from "../SlotSidebar";
import { ModRegistry } from "../../../../mod-system/ModRegistry";
import { WorkspaceBus } from "../../../../workspace/WorkspaceBus";
import { BlockEvent } from "../../../../mod-system/BlockEvent";
import type {
  SlotContext,
  BlockBinding,
  BlockRegistration,
  SlotDeclaration,
  BlockInstance,
  BlockComponentProps,
} from "../../../../mod-system/types";

// ── Helpers ──────────────────────────────────────────────────────────────

function DummyIcon() {
  return null;
}

/** A test block that renders identifiable content for assertions. */
function TestBlock({ instance }: { context: SlotContext; instance: BlockInstance }) {
  return (
    <div data-testid={`block-content-${instance.blockId}`}>
      Content for {instance.blockId}
    </div>
  );
}

function makeBlockReg(
  overrides?: Partial<BlockRegistration>,
): BlockRegistration {
  return {
    id: "test.block",
    label: "Test Block",
    icon: DummyIcon,
    component: TestBlock,
    listensTo: [],
    onEvent: {},
    emits: [],
    serialize: (state) => JSON.stringify(state),
    deserialize: (json) => JSON.parse(json),
    defaultState: {},
    ...overrides,
  };
}

function makeSlotDecl(
  overrides?: Partial<SlotDeclaration>,
): SlotDeclaration {
  // SlotSidebar is used as the renderer itself (not the test subject as renderer)
  const DummyRenderer = () => null;
  return {
    id: "test.sidebar",
    accepts: "block",
    renderer: DummyRenderer,
    layout: "vertical",
    order: 0,
    defaults: {},
    ...overrides,
  };
}

function makeBlockBinding(
  overrides?: Partial<BlockBinding>,
): BlockBinding {
  return {
    type: "block" as const,
    id: "test.block",
    label: "Test Block",
    icon: DummyIcon,
    component: TestBlock,
    listensTo: [],
    onEvent: {},
    emits: [],
    order: 0,
    overrides: {},
    serialize: (s) => JSON.stringify(s),
    deserialize: (j) => JSON.parse(j),
    defaultState: {},
    ...overrides,
  };
}

const STUB_BUS = new WorkspaceBus();

const STUB_CONTEXT: SlotContext = {
  workspaceId: "test",
  user: null,
  viewMode: null,
};

// ── Tests ────────────────────────────────────────────────────────────────

describe("SlotSidebar", () => {
  // ── Standalone mode ───────────────────────────────────────────────────

  describe("standalone mode", () => {
    beforeEach(() => {
      ModRegistry._reset();
    });

    it("returns null when the slot is not declared", () => {
      const { container } = render(
        <SlotSidebar slotId="nonexistent.sidebar" />,
      );
      expect(container.innerHTML).toBe("");
    });

    it("returns null when the slot has no bindings", () => {
      ModRegistry._reset();
      const registry = ModRegistry.getInstance();
      registry.declareSlot(makeSlotDecl({ id: "empty.sidebar" }));

      const { container } = render(
        <SlotSidebar slotId="empty.sidebar" />,
      );
      expect(container.innerHTML).toBe("");
    });

    it("renders blocks inside a CollapsibleSidebar (complementary role)", () => {
      ModRegistry._reset();
      const registry = ModRegistry.getInstance();
      registry.declareSlot(makeSlotDecl({ id: "test.sidebar" }));
      registry.registerBlock(
        makeBlockReg({ id: "test.block", label: "Section A" }),
      );
      registry.registerIntoSlot("test.sidebar", "test.block", {}, 0);

      render(<SlotSidebar slotId="test.sidebar" />);

      // CollapsibleSidebar renders an <aside role="complementary">
      expect(screen.getByRole("complementary")).toBeInTheDocument();
    });

    it("renders each block wrapped in a SidebarSection with correct label", () => {
      ModRegistry._reset();
      const registry = ModRegistry.getInstance();
      registry.declareSlot(makeSlotDecl({ id: "test.sidebar" }));
      registry.registerBlock(
        makeBlockReg({ id: "test.block", label: "Section A" }),
      );
      registry.registerIntoSlot("test.sidebar", "test.block", {}, 0);

      render(<SlotSidebar slotId="test.sidebar" />);

      expect(screen.getByText("Section A")).toBeInTheDocument();
    });

    it("renders multiple blocks with distinct SidebarSections", () => {
      ModRegistry._reset();
      const registry = ModRegistry.getInstance();
      registry.declareSlot(makeSlotDecl({ id: "test.sidebar" }));
      registry.registerBlock(
        makeBlockReg({ id: "test.a", label: "Section A" }),
      );
      registry.registerBlock(
        makeBlockReg({ id: "test.b", label: "Section B" }),
      );
      registry.registerIntoSlot("test.sidebar", "test.a", {}, 0);
      registry.registerIntoSlot("test.sidebar", "test.b", {}, 1);

      render(<SlotSidebar slotId="test.sidebar" />);

      expect(screen.getByText("Section A")).toBeInTheDocument();
      expect(screen.getByText("Section B")).toBeInTheDocument();
    });

    it("renders block component content", () => {
      ModRegistry._reset();
      const registry = ModRegistry.getInstance();
      registry.declareSlot(makeSlotDecl({ id: "test.sidebar" }));
      registry.registerBlock(
        makeBlockReg({ id: "test.block", label: "Section A" }),
      );
      registry.registerIntoSlot("test.sidebar", "test.block", {}, 0);

      render(<SlotSidebar slotId="test.sidebar" />);

      expect(
        screen.getByTestId("block-content-test.block"),
      ).toBeInTheDocument();
    });
  });

  // ── Renderer mode ────────────────────────────────────────────────────

  describe("renderer mode", () => {
    it("returns null when bindings array is empty", () => {
      const { container } = render(
        <SlotSidebar
          slotId="test.sidebar"
          bindings={[]}
          bus={STUB_BUS}
          context={STUB_CONTEXT}
        />,
      );
      expect(container.innerHTML).toBe("");
    });

    it("renders blocks from bindings prop", () => {
      const bindings = [
        makeBlockBinding({ id: "test.block", label: "Test Block" }),
      ];

      render(
        <SlotSidebar
          slotId="test.sidebar"
          bindings={bindings}
          bus={STUB_BUS}
          context={STUB_CONTEXT}
        />,
      );

      expect(screen.getByText("Test Block")).toBeInTheDocument();
    });

    it("renders inside a CollapsibleSidebar", () => {
      const bindings = [
        makeBlockBinding({ id: "test.block", label: "Test Block" }),
      ];

      render(
        <SlotSidebar
          slotId="test.sidebar"
          bindings={bindings}
          bus={STUB_BUS}
          context={STUB_CONTEXT}
        />,
      );

      expect(screen.getByRole("complementary")).toBeInTheDocument();
    });

    it("renders block component content in renderer mode", () => {
      const bindings = [
        makeBlockBinding({ id: "test.block", label: "Test Block" }),
      ];

      render(
        <SlotSidebar
          slotId="test.sidebar"
          bindings={bindings}
          bus={STUB_BUS}
          context={STUB_CONTEXT}
        />,
      );

      expect(
        screen.getByTestId("block-content-test.block"),
      ).toBeInTheDocument();
    });

    // ── emitAction ─────────────────────────────────────────────────────

    it("passes emitAction to block component via augmented context", () => {
      const receivedEmitAction: Array<
        ((localId: string, payload?: Record<string, unknown>) => void) | undefined
      > = [];

      function EmitActionTestBlock({ context }: BlockComponentProps) {
        receivedEmitAction.push(context.emitAction);
        return (
          <div data-testid="block-content-test.block">
            {typeof context.emitAction}
          </div>
        );
      }

      const bindings = [
        makeBlockBinding({
          id: "test.block",
          label: "Test Block",
          component: EmitActionTestBlock,
          emits: [
            BlockEvent.action({ id: "row-added", core: "created" }),
          ],
        }),
      ];

      render(
        <SlotSidebar
          slotId="test.sidebar"
          bindings={bindings}
          bus={STUB_BUS}
          context={STUB_CONTEXT}
        />,
      );

      expect(receivedEmitAction[0]).toBeTypeOf("function");
    });

    it("emitAction emits on bus with correct event pattern", () => {
      const receivedPayloads: unknown[] = [];
      STUB_BUS.on("test.block.row-added", (payload) => {
        receivedPayloads.push(payload);
      });

      let capturedEmitAction:
        | ((localId: string, payload?: Record<string, unknown>) => void)
        | undefined;

      function EmitTestBlock({ context }: BlockComponentProps) {
        capturedEmitAction = context.emitAction;
        return <div data-testid="block-content-test.block" />;
      }

      const bindings = [
        makeBlockBinding({
          id: "test.block",
          label: "Test Block",
          component: EmitTestBlock,
          emits: [
            BlockEvent.action({ id: "row-added", core: "created" }),
          ],
        }),
      ];

      render(
        <SlotSidebar
          slotId="test.sidebar"
          bindings={bindings}
          bus={STUB_BUS}
          context={STUB_CONTEXT}
        />,
      );

      capturedEmitAction?.("row-added", { rowCount: 3 });

      expect(receivedPayloads.length).toBe(1);
      expect(receivedPayloads[0]).toMatchObject({
        blockId: "test.block",
        localId: "row-added",
        payload: { rowCount: 3 },
      });
    });
  });

  // ── Collapse behavior ────────────────────────────────────────────────

  describe("collapse behavior", () => {
    beforeEach(() => {
      ModRegistry._reset();
    });

    it("renders collapse toggle button", () => {
      ModRegistry._reset();
      const registry = ModRegistry.getInstance();
      registry.declareSlot(makeSlotDecl({ id: "test.sidebar" }));
      registry.registerBlock(
        makeBlockReg({ id: "test.block", label: "Section A" }),
      );
      registry.registerIntoSlot("test.sidebar", "test.block", {}, 0);

      render(<SlotSidebar slotId="test.sidebar" />);

      expect(
        screen.getByRole("button", { name: "Collapse sidebar" }),
      ).toBeInTheDocument();
    });

    it("hides block content when sidebar is collapsed", () => {
      ModRegistry._reset();
      const registry = ModRegistry.getInstance();
      registry.declareSlot(makeSlotDecl({ id: "test.sidebar" }));
      registry.registerBlock(
        makeBlockReg({ id: "test.block", label: "Section A" }),
      );
      registry.registerIntoSlot("test.sidebar", "test.block", {}, 0);

      render(<SlotSidebar slotId="test.sidebar" />);

      const toggle = screen.getByRole("button", {
        name: "Collapse sidebar",
      });
      fireEvent.click(toggle);

      // When the sidebar is collapsed with variant="full-hide", the section
      // content is not rendered — the CollapsibleSidebar hides children.
      expect(
        screen.queryByTestId("block-content-test.block"),
      ).not.toBeInTheDocument();
    });

    it("shows expand button when collapsed", () => {
      ModRegistry._reset();
      const registry = ModRegistry.getInstance();
      registry.declareSlot(makeSlotDecl({ id: "test.sidebar" }));
      registry.registerBlock(
        makeBlockReg({ id: "test.block", label: "Section A" }),
      );
      registry.registerIntoSlot("test.sidebar", "test.block", {}, 0);

      render(<SlotSidebar slotId="test.sidebar" />);

      fireEvent.click(
        screen.getByRole("button", { name: "Collapse sidebar" }),
      );

      expect(
        screen.getByRole("button", { name: "Expand sidebar" }),
      ).toBeInTheDocument();
    });

    it("restores content when sidebar is re-expanded", () => {
      ModRegistry._reset();
      const registry = ModRegistry.getInstance();
      registry.declareSlot(makeSlotDecl({ id: "test.sidebar" }));
      registry.registerBlock(
        makeBlockReg({ id: "test.block", label: "Section A" }),
      );
      registry.registerIntoSlot("test.sidebar", "test.block", {}, 0);

      render(<SlotSidebar slotId="test.sidebar" />);

      // Collapse
      fireEvent.click(
        screen.getByRole("button", { name: "Collapse sidebar" }),
      );
      expect(
        screen.queryByTestId("block-content-test.block"),
      ).not.toBeInTheDocument();

      // Expand
      fireEvent.click(
        screen.getByRole("button", { name: "Expand sidebar" }),
      );
      expect(
        screen.getByTestId("block-content-test.block"),
      ).toBeInTheDocument();
    });

    it("preserves section collapse state across sidebar collapse/expand", () => {
      ModRegistry._reset();
      const registry = ModRegistry.getInstance();
      registry.declareSlot(makeSlotDecl({ id: "test.sidebar" }));
      registry.registerBlock(
        makeBlockReg({ id: "test.a", label: "Section A" }),
      );
      registry.registerBlock(
        makeBlockReg({ id: "test.b", label: "Section B" }),
      );
      registry.registerIntoSlot("test.sidebar", "test.a", {}, 0);
      registry.registerIntoSlot("test.sidebar", "test.b", {}, 1);

      render(<SlotSidebar slotId="test.sidebar" />);

      // Collapse Section A (click its header label)
      fireEvent.click(screen.getByText("Section A"));
      expect(
        screen.queryByTestId("block-content-test.a"),
      ).not.toBeInTheDocument();
      // Section B should still have its content visible
      expect(
        screen.getByTestId("block-content-test.b"),
      ).toBeInTheDocument();

      // Collapse the whole sidebar
      fireEvent.click(
        screen.getByRole("button", { name: "Collapse sidebar" }),
      );

      // Expand the sidebar again
      fireEvent.click(
        screen.getByRole("button", { name: "Expand sidebar" }),
      );

      // Section A should still be collapsed (header visible, content hidden)
      expect(screen.getByText("Section A")).toBeInTheDocument();
      expect(
        screen.queryByTestId("block-content-test.a"),
      ).not.toBeInTheDocument();

      // Section B should be expanded (header visible, content visible)
      expect(screen.getByText("Section B")).toBeInTheDocument();
      expect(
        screen.getByTestId("block-content-test.b"),
      ).toBeInTheDocument();
    });
  });

  // ── Icon rendering ──────────────────────────────────────────────────

  describe("icon rendering", () => {
    beforeEach(() => {
      ModRegistry._reset();
    });

    it("renders block icon in SidebarSection header", () => {
      ModRegistry._reset();
      const registry = ModRegistry.getInstance();
      registry.declareSlot(makeSlotDecl({ id: "test.sidebar" }));
      // Use a recognizable icon element that can be queried
      function StarIcon({ size, className }: { size?: number; className?: string }) {
        return <svg data-testid="icon-star" data-size={size} className={className} />;
      }
      registry.registerBlock(
        makeBlockReg({
          id: "test.block",
          label: "Test Section",
          icon: StarIcon,
        }),
      );
      registry.registerIntoSlot("test.sidebar", "test.block", {}, 0);

      render(<SlotSidebar slotId="test.sidebar" />);

      // The icon should be rendered in the SidebarSection header
      const icon = screen.getByTestId("icon-star");
      expect(icon).toBeInTheDocument();

      // The icon should appear before the label in the header
      const header = screen.getByText("Test Section").parentElement;
      const iconEl = header?.querySelector("[data-testid='icon-star']");
      const labelEl = header?.querySelector(".sidebar-section-label");
      expect(iconEl).toBeInTheDocument();
      expect(labelEl).toBeInTheDocument();
      // Icon should be before label in DOM order
      expect(
        iconEl!.compareDocumentPosition(labelEl!),
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });
  });

  // ── Accessibility ────────────────────────────────────────────────────

  describe("accessibility", () => {
    beforeEach(() => {
      ModRegistry._reset();
    });

    it("CollapsibleSidebar uses complementary role", () => {
      ModRegistry._reset();
      const registry = ModRegistry.getInstance();
      registry.declareSlot(makeSlotDecl({ id: "test.sidebar" }));
      registry.registerBlock(
        makeBlockReg({ id: "test.block", label: "Section A" }),
      );
      registry.registerIntoSlot("test.sidebar", "test.block", {}, 0);

      render(<SlotSidebar slotId="test.sidebar" />);

      expect(screen.getByRole("complementary")).toBeInTheDocument();
    });

    it("toggle button has accessible label", () => {
      ModRegistry._reset();
      const registry = ModRegistry.getInstance();
      registry.declareSlot(makeSlotDecl({ id: "test.sidebar" }));
      registry.registerBlock(
        makeBlockReg({ id: "test.block", label: "Section A" }),
      );
      registry.registerIntoSlot("test.sidebar", "test.block", {}, 0);

      render(<SlotSidebar slotId="test.sidebar" />);

      const toggle = screen.getByRole("button", {
        name: "Collapse sidebar",
      });
      expect(toggle).toHaveAttribute("title", "Collapse sidebar");
      expect(toggle).toHaveAttribute("aria-label", "Collapse sidebar");
    });
  });
});
