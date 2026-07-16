/**
 * React NodeView component for block nodes inside TipTapRenderer.
 *
 * Adapted from `useBlockInstance` for the ProseMirror NodeView lifecycle.
 * PanelRenderer and TabRenderer use `useBlockInstance` directly in React
 * DOM; TipTapRenderer's NodeView needs the same semantics (stable instance,
 * event routing, cleanup) but inside TipTap's NodeView lifecycle, so we
 * replicate the logic here with TipTap-specific concerns:
 *
 * - `updateAttrs` serializes new state and calls TipTap's `updateAttributes`
 *   to persist changes to the ProseMirror node attribute.
 * - Lifecycle events (`created`/`edited`/`deleted`) are emitted on the
 *   workspace bus automatically — block authors never call `bus.emit()`.
 * - Bus subscriptions for `listensTo` events are cleaned up on NodeView
 *   destruction (unmount).
 */
import { useEffect, useRef } from "react";
import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import type { BlockBinding, SlotContext, BlockInstance } from "../../mod-system/types";
import type { WorkspaceBus } from "../WorkspaceBus";

// ── Props ──────────────────────────────────────────────────────────────────

export interface BlockNodeViewProps extends NodeViewProps {
  /** Resolved block binding with component, serialize/deserialize, etc. */
  binding: BlockBinding;
  /** Workspace-scoped event bus for lifecycle events and event routing. */
  bus: WorkspaceBus;
  /** The slot this block instance lives in. */
  slotId: string;
  /** Flat metadata bag available to the block component. */
  context: SlotContext;
}

// ── Component ──────────────────────────────────────────────────────────────

/**
 * Canvas for a single block rendered inside the TipTap editor.
 *
 * Creates a stable `BlockInstance` handle on mount, manages lifecycle
 * events, subscribes to bus events declared in `listensTo`, and renders
 * the block's React component via `NodeViewWrapper`.
 *
 * The block component receives `BlockComponentProps` — `{ context, instance }`.
 * There is no `bus` prop; blocks respond to events declaratively via `onEvent`.
 */
export function BlockNodeView(props: BlockNodeViewProps) {
  const { node, updateAttributes, binding, bus, slotId, context } = props;

  // ── Instance (stable identity) ────────────────────────────────────────

  // Create instance once with current (possibly default) content.
  // Use ref so onEvent handlers always read the latest attrs.
  const instanceRef = useRef<BlockInstance>({
    id: `${binding.id}::${crypto.randomUUID()}`,
    blockId: binding.id,
    slotId,
    attrs: binding.deserialize(node.attrs.content as string),
    updateAttrs: (newAttrs: Record<string, unknown>) => {
      const serialized = binding.serialize(newAttrs);
      // Persist to ProseMirror node attribute — triggers re-render
      updateAttributes({ content: serialized });
    },
  });

  // Track previous content for change detection.
  const prevContentRef = useRef<string | null>(null);
  const currentContent = stringifyContent(node.attrs.content);

  // Keep instance attrs in sync when node.content changes.
  // Runs before the edited effect (effects execute in declaration order)
  // so onEvent handlers always read current attrs.
  useEffect(() => {
    if (prevContentRef.current === null) {
      // First render — record baseline, don't sync (already set in ref init)
      prevContentRef.current = currentContent;
      return;
    }

    if (prevContentRef.current !== currentContent) {
      prevContentRef.current = currentContent;
      instanceRef.current = {
        ...instanceRef.current,
        attrs: binding.deserialize(currentContent),
      };
    }
  }, [currentContent, binding]);

  // ── Lifecycle: created ─────────────────────────────────────────────────

  const hasEmittedCreated = useRef(false);

  useEffect(() => {
    // Only emit on true mount, not on React Strict Mode double-invoke
    if (hasEmittedCreated.current) return;
    hasEmittedCreated.current = true;

    const eventName = `${binding.id}.created`;
    bus.emit(eventName, {
      blockId: binding.id,
      slotId,
      blockInstanceId: instanceRef.current.id,
      attrs: instanceRef.current.attrs,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Lifecycle: edited ──────────────────────────────────────────────────

  // Track initial render to avoid emitting "edited" for the initial mount
  const isInitialRender = useRef(true);

  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false;
      return;
    }

    const eventName = `${binding.id}.edited`;
    bus.emit(eventName, {
      blockId: binding.id,
      slotId,
      blockInstanceId: instanceRef.current.id,
      changedAttrs: binding.deserialize(currentContent),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentContent]);

  // ── Lifecycle: deleted ─────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      const eventName = `${binding.id}.deleted`;
      bus.emit(eventName, {
        blockId: binding.id,
        slotId,
        blockInstanceId: instanceRef.current.id,
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Event routing: listensTo → onEvent ─────────────────────────────────

  useEffect(() => {
    const unsubscribes: Array<() => void> = [];

    for (const event of binding.listensTo) {
      const handler = binding.onEvent[event];
      if (!handler) continue;

      const unsub = bus.on(event, (payload: unknown) => {
        // Always use the latest instance ref so onEvent sees current attrs
        return handler(instanceRef.current, payload);
      });
      unsubscribes.push(unsub);
    }

    return () => {
      for (const unsub of unsubscribes) {
        unsub();
      }
    };
  }, [binding.listensTo, binding.onEvent, bus]);

  // ── Render ─────────────────────────────────────────────────────────────

  const BlockComponent = binding.component;

  return (
    <NodeViewWrapper
      className="block-node-view-wrapper"
      data-block-type={binding.id}
    >
      <BlockComponent context={context} instance={instanceRef.current} />
    </NodeViewWrapper>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Normalise the `content` attribute to a string.
 *
 * When `content` is `undefined` because no attributes were persisted yet
 * (fresh node insert), fall back to the empty JSON object so the caller
 * always gets a deserializable string.
 */
function stringifyContent(content: unknown): string {
  if (typeof content === "string") return content;
  return "{}";
}
