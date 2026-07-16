/**
 * TipTapRenderer — the editor renderer.
 *
 * The most complex built-in renderer. Takes resolved block bindings,
 * generates a TipTap Node extension for each block from `binding.overrides`
 * (nodeType → group, atom setting), builds the ProseMirror schema at editor
 * mount time, and creates NodeViews that mount each block's React component.
 *
 * Lifecycle events (`created`, `edited`, `deleted`) are emitted on the bus
 * automatically — block authors never call `bus.emit()`. Event routing:
 * subscribes to `bus.on()` for each block's `listensTo` events and routes
 * to the matching `onEvent` handler with `(instance, payload)`.
 *
 * #223 — SlotRenderer + Simple Renderers spec
 * #224 — TipTapRenderer spec
 */
import { useMemo } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import type { RendererProps, BlockBinding } from "../../mod-system/types";
import { createBlockNode } from "./createBlockNode";

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
}

/**
 * The editor renderer. Creates a TipTap editor with one custom Node
 * extension per resolved block binding. Each block becomes a named node
 * type rendered via a React NodeView.
 *
 * Standard ProseMirror nodes (paragraph, heading, text, etc.) are provided
 * by StarterKit and are always available alongside the custom block nodes.
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
}: TipTapRendererProps) {
  // Generate one TipTap Node extension per binding.
  // Stable across renders — bindings only change when the registry re-resolves.
  const extensions = useMemo(() => {
    const blockNodes = bindings.map((binding) =>
      createBlockNode(binding, bus, slotId, context),
    );
    return [StarterKit, ...blockNodes];
  }, [bindings, bus, slotId, context]);

  const editor = useEditor({
    extensions,
    content,
    onCreate: ({ editor: editorInstance }) => {
      onCreate?.(editorInstance as Editor);
    },
  });

  if (bindings.length === 0) return null;

  return (
    <div className="tiptap-renderer">
      <EditorContent editor={editor} />
    </div>
  );
}
