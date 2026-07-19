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
      // Merge with existing state so partial updates don't lose other fields.
      // Mirrors TipTap's native updateAttributes merge semantics.
      const merged = { ...instanceRef.current.attrs, ...newAttrs };
      const serialized = binding.serialize(merged);
      // Persist to ProseMirror node attribute — triggers re-render
      updateAttributes({ content: serialized });
    },
  });

  // Track previous content for change detection.
  const prevContentRef = useRef<string | null>(null);
  const currentContent = stringifyContent(node.attrs.content);

  // Sync instance attrs from node content DURING render — before the block
  // component receives instanceRef.current.  This was previously a
  // useEffect, which runs AFTER render, so the block component always saw
  // stale attrs from the previous render pass.  Syncing during render
  // guarantees that instanceRef.current.attrs matches the ProseMirror node
  // when the block component reads it.
  //
  // On the first render prevContentRef is null — instanceRef already holds
  // the initial deserialized attrs from the useRef initializer, so we skip.
  if (
    prevContentRef.current !== null &&
    prevContentRef.current !== currentContent
  ) {
    instanceRef.current = {
      ...instanceRef.current,
      attrs: binding.deserialize(currentContent),
    };
  }
  prevContentRef.current = currentContent;

  // ── Lifecycle: created ─────────────────────────────────────────────────

  const hasEmittedCreated = useRef(false);

  useEffect(() => {
    // Only emit on true mount, not on React Strict Mode double-invoke.
    // The ref survives the simulated unmount/remount cycle so the second
    // effect invocation sees it as true and skips.
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

  // Track the last committed content so we only emit "edited" when content
  // genuinely changes from the baseline — not on mount or on Strict Mode
  // double-invoke (where content is identical on the second run).
  const committedContentRef = useRef<string | null>(null);

  useEffect(() => {
    if (committedContentRef.current === null) {
      // First commit — record the baseline, don't emit
      committedContentRef.current = currentContent;
      return;
    }

    if (committedContentRef.current !== currentContent) {
      committedContentRef.current = currentContent;
      const eventName = `${binding.id}.edited`;
      bus.emit(eventName, {
        blockId: binding.id,
        slotId,
        blockInstanceId: instanceRef.current.id,
        changedAttrs: binding.deserialize(currentContent),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentContent]);

  // ── Lifecycle: deleted ─────────────────────────────────────────────────

  // Strict Mode (dev) double-invokes effects: mount → cleanup → re-mount.
  // The cleanup runs between the two effect invocations, which would
  // spuriously emit "deleted".  We detect this by storing a generation
  // token in a ref, replacing it on each effect run, and checking in a
  // microtask whether our token was replaced (Strict Mode re-mount) or is
  // still ours (real unmount).
  const unmountTokenRef = useRef<object | null>(null);

  useEffect(() => {
    const token = {};
    unmountTokenRef.current = token;

    return () => {
      // Schedule a microtask — if a Strict Mode re-mount happens, it runs
      // synchronously after this cleanup and replaces the token before the
      // microtask fires.  On a real unmount, nobody replaces the token.
      queueMicrotask(() => {
        if (unmountTokenRef.current === token) {
          const eventName = `${binding.id}.deleted`;
          bus.emit(eventName, {
            blockId: binding.id,
            slotId,
            blockInstanceId: instanceRef.current.id,
          });
        }
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

  // Per-block centering: max-w-3xl mx-auto by default.
  // When overrides.stretch is true, the block reads its runtime stretchMode
  // from attrs to decide layout:
  //   "auto" → left-aligned with text column, grows into right gutter
  //   "full" → edge-to-edge, expanding past the counterweight and gutters
  const stretch = binding.overrides.stretch === true;
  const stretchMode = stretch
    ? ((instanceRef.current.attrs as Record<string, unknown>).stretchMode as string ?? "auto")
    : undefined;
  const wrapperClass = stretch
    ? stretchMode === "full"
      ? "block-node-view-wrapper block-node-view-wrapper--stretch block-node-view-wrapper--stretch-full"
      : "block-node-view-wrapper block-node-view-wrapper--stretch-auto"
    : "block-node-view-wrapper max-w-3xl mx-auto";

  return (
    <NodeViewWrapper
      className={wrapperClass}
      data-block-type={binding.id}
      contentEditable={false}
    >
      <BlockComponent context={context} instance={instanceRef.current} overrides={binding.overrides} />
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
