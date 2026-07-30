/**
 * TipTapRenderer — the editor renderer.
 *
 * The most complex built-in renderer. Takes resolved block bindings,
 * generates a TipTap Node extension for each block from `binding.overrides`
 * (nodeType → group, atom setting), builds the ProseMirror schema at editor
 * mount time, and creates NodeViews that mount each block's React component.
 *
 * Lifecycle events (`created`, `edited`, `deleted`) flow through internal
 * callbacks to `useActionAccumulator` — they are no longer emitted on the
 * public bus. Event routing: subscribes to `bus.on()` for each block's
 * `listensTo` events and routes to the matching `onEvent` handler with
 * `(instance, payload)`.
 *
 * #223 — SlotRenderer + Simple Renderers spec
 * #224 — TipTapRenderer spec
 * #351 — useActionAccumulator replaces useBlockActionLogging
 */
import { useMemo } from "react";
import type { MutableRefObject } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import type { Editor, Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import type { RendererProps, BlockBinding } from "../../mod-system/types";
import { createBlockNode } from "./createBlockNode";
import { useActionAccumulator } from "./useActionAccumulator";

// ── Props ──────────────────────────────────────────────────────────────────

export interface TipTapRendererProps extends RendererProps<BlockBinding> {
  /**
   * Optional callback invoked when the editor is created.
   *
   * Primarily for testing — allows tests to access the editor instance
   * for inserting blocks, verifying schema, etc. Not part of the renderer
   * contract; only TipTapRenderer exposes this.
   */
  onCreate?: (editor: Editor) => void;

  /**
   * Optional initial content for the editor.
   *
   * Accepts TipTap Content (HTML string, ProseMirror JSON, or null).
   * Defaults to null (empty document with just a paragraph).
   */
  content?: string | object | null;

  /**
   * Additional TipTap extensions merged after StarterKit and block node
   * wiring. The workspace controls which extensions are active; the
   * renderer controls how they are assembled.
   */
  extensions?: Extensions;

  /**
   * Called on every editor content change. Receives the editor instance
   * for content tracking, dirty-checking, and auto-save integration.
   */
  onUpdate?: (editor: Editor) => void;

  /**
   * Controls whether the editor accepts user input.
   * Maps to TipTap's `editable` option. Defaults to `true`.
   */
  editable?: boolean;

  /**
   * When this value transitions (strict inequality), accumulated block
   * lifecycle actions are flushed to the backend via `onFlushActions`.
   * The initial null → value transition is skipped (initial load).
   */
  saveSignal?: unknown;

  /**
   * Numeric target ID for sendAction calls. Flush is skipped when
   * undefined (new entry, not yet created).
   */
  targetId?: number;

  /**
   * Bound sendAction function that posts to POST /api/actions/.
   * Called once per accumulated action during flush.
   */
  onFlushActions?: (
    actionType: string,
    targetType: string,
    targetId: number,
    metadata?: Record<string, unknown>,
    requestId?: string,
  ) => Promise<void>;

  /**
   * Optional mutable ref that the accumulator updates to `true` when
   * pending actions exist, `false` when empty. Callers read this at
   * save time to decide whether to set the X-Block-Actions header.
   */
  hasPendingRef?: MutableRefObject<boolean>;
}

/**
 * The editor renderer. Creates a TipTap editor with one custom Node
 * extension per resolved block binding. Each block becomes a named node
 * type rendered via a React NodeView.
 *
 * Standard ProseMirror nodes (paragraph, heading, text, etc.) are provided
 * by StarterKit and are always available alongside the custom block nodes.
 *
 * Additional extensions passed via the `extensions` prop are merged after
 * StarterKit and block node wiring, giving the workspace control over
 * which extensions are active while the renderer controls assembly order.
 *
 * Renders nothing when `bindings` is empty.
 */
export function TipTapRenderer({
  slotId,
  bindings,
  bus,
  context,
  onCreate,
  content = null,
  extensions: additionalExtensions = [],
  onUpdate,
  editable = true,
  saveSignal,
  targetId,
  onFlushActions,
  hasPendingRef,
}: TipTapRendererProps) {
  // ── Action accumulator ─────────────────────────────────────────────────
  const { onLifecycleEvent } = useActionAccumulator({
    bus,
    workspaceId: context.workspaceId,
    saveSignal,
    targetId,
    onFlushActions,
    hasPendingRef,
  });

  // Merge block node wiring with additional extensions.
  // Stable across renders — bindings only change when the registry re-resolves.
  // onLifecycleEvent is stable (useCallback with []) so it won't cause churn.
  const extensions = useMemo(() => {
    const blockNodes = bindings.map((binding) =>
      createBlockNode(binding, bus, slotId, context, onLifecycleEvent),
    );
    return [StarterKit, ...blockNodes, ...additionalExtensions];
  }, [bindings, bus, slotId, context, additionalExtensions, onLifecycleEvent]);

  const editor = useEditor({
    extensions,
    content,
    editable,
    onCreate: ({ editor: editorInstance }) => {
      onCreate?.(editorInstance as Editor);
    },
    onUpdate: ({ editor: editorInstance }) => {
      onUpdate?.(editorInstance as Editor);
    },
  });

  if (bindings.length === 0) return null;

  return (
    <div className="tiptap-renderer">
      <EditorContent editor={editor} />
    </div>
  );
}
