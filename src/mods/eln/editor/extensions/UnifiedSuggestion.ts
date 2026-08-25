/**
 * Unified TipTap suggestion extension for both "/" (slash commands)
 * and "#" (mention references).
 *
 * Why combined?  Two separate ``@tiptap/suggestion`` plugins each create
 * their own ``DecorationSet`` via ``DecorationSet.create()``.  When both
 * decorations exist in the same document, ProseMirror's internal
 * ``DecorationGroup`` can produce an undefined member, crashing with
 * ``Cannot read properties of undefined (reading 'localsInner')``.
 *
 * By using a **single** ``Suggestion()`` call with a custom
 * ``findSuggestionMatch`` that tries both characters, there is only one
 * ``Plugin``, one ``DecorationSet``, and no ``DecorationGroup`` collision.
 *
 * References:
 * - tiptap #5074, #3869
 * - ProseMirror Discuss #8290
 */
import { Extension } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion, { findSuggestionMatch, exitSuggestion } from "@tiptap/suggestion";
import type {
  Trigger,
  SuggestionMatch,
} from "@tiptap/suggestion";
import { createSuggestionDropdown } from "./suggestionDropdown";
import { ModRegistry } from "../../../../shell/src/mod-system/ModRegistry";
import { BlockPopover } from "../../../../shell/src/workspace/TipTapRenderer/BlockPopover";
import type { BlockBinding } from "../../../../shell/src/mod-system/types";
import { get } from "../../../../shell/src/api/client";
import type { SearchResult } from "../../../../shell/src/mentions/types";

const UNIFIED_SUGGESTION_KEY = new PluginKey("unified-suggestion");

/** Pattern: exact display ID match (e.g. "E1", "S42"). */
export const DISPLAY_ID_PATTERN = /^[A-Z]\d+$/i;

// ── Types ────────────────────────────────────────────────────────────

interface SlashCommand {
  label: string;
  description: string;
  icon: string;
  action: (editor: any, range: { from: number; to: number }) => void;
}

// ── Slash-command helpers ──────────────────────────────────────────

export function getCommands(): SlashCommand[] {
  const blocks = ModRegistry.getInstance().getBlocks();
  const commands: SlashCommand[] = [];

  for (const block of blocks.values()) {
    const serializedContent = block.serialize(block.defaultState);

    commands.push({
      label: block.label,
      description: block.tags?.join(", ") ?? "",
      icon: "📦",
      action: (editor, range) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContentAt(range.from, {
            type: block.id,
            attrs: { content: serializedContent },
          })
          .run();
      },
    });
  }

  commands.sort((a, b) => a.label.localeCompare(b.label));
  return commands;
}

export function fuzzyMatch(text: string, query: string): boolean {
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

// ── Mention-search helper ──────────────────────────────────────────

export async function fetchItems(query: string): Promise<SearchResult[]> {
  if (!query) return [];
  try {
    const data = await get<{ results: SearchResult[] }>(
      `/mentions/search/?q=${encodeURIComponent(query)}`,
    );
    return data.results;
  } catch {
    return [];
  }
}

// ── Dropdown renderers ───────────────────────────────────────────────

function mentionDropdownRenderer() {
  return createSuggestionDropdown<SearchResult>({
    popupClass: "reference-dropdown",
    emptyClass: "reference-dropdown-item is-empty",

    renderItem: (item, _i, _isSelected) =>
      `<span class="ref-dropdown-id">${item.display_id}</span>
       <span class="ref-dropdown-title">${item.title}</span>
       ${item.workspaceId ? `<span class="ref-dropdown-workspace">${item.workspaceId}</span>` : ""}`,

    onExtraKeyDown: (props, state) => {
      if (props.event.key === " ") {
        if (DISPLAY_ID_PATTERN.test(state.query) && state.command) {
          const item: SearchResult =
            state.items.length > 0
              ? state.items[0]
              : {
                  display_id: state.query.toUpperCase(),
                  title: "",
                  type: "entry",
                  icon: "📄",
                  workspaceId: null,
                };
          state.command(item);
          props.event.preventDefault();
          return true;
        }
        return false;
      }
      return false;
    },
  })();
}

// ── Extension ────────────────────────────────────────────────────────

const UnifiedSuggestion = Extension.create({
  name: "unifiedSuggestion",

  addProseMirrorPlugins() {
    /** The character that triggered the current active suggestion. */
    let activeTrigger: "/" | "#" | null = null;

    /**
     * Custom match function that tries ``/`` first, then ``#``.
     *
     * Downstream callbacks (``items``, ``command``, ``allow``, ``render``)
     * inspect ``activeTrigger`` to decide which variant to serve.
     */
    function customFindSuggestionMatch(
      config: Trigger,
    ): SuggestionMatch {
      const slashMatch = findSuggestionMatch({ ...config, char: "/" });
      if (slashMatch) {
        activeTrigger = "/";
        return slashMatch;
      }
      const hashMatch = findSuggestionMatch({ ...config, char: "#" });
      if (hashMatch) {
        activeTrigger = "#";
        return hashMatch;
      }
      activeTrigger = null;
      return null;
    }

    return [
      Suggestion({
        editor: this.editor as any,
        char: "/", // Handled by customFindSuggestionMatch above
        pluginKey: UNIFIED_SUGGESTION_KEY,
        findSuggestionMatch: customFindSuggestionMatch,

        // ── Items ──────────────────────────────────────────────
        items: async ({ query }: { query: string }) => {
          // Capture trigger synchronously — the variable can change
          // before this async function resolves (e.g. / dismissed,
          // # triggered, activeTrigger overwritten).
          const trigger = activeTrigger;
          if (trigger === "/") {
            const bindings = ModRegistry.getInstance()
              .resolveSlot("eln.editor")?.bindings
              .filter((binding): binding is BlockBinding => binding.type === "block") ?? [];
            if (!query) return bindings;
            return bindings.filter((binding) =>
              fuzzyMatch(`${binding.label} ${binding.id} ${(binding.tags ?? []).join(" ")}`, query),
            );
          }
          if (trigger === "#") {
            return fetchItems(query);
          }
          return [];
        },

        // ── Command (selection) ────────────────────────────────
        command: ({
          editor,
          range,
          props,
        }: {
          editor: any;
          range: any;
          props: any;
        }) => {
          const trigger = activeTrigger;
          // Explicitly exit the suggestion before modifying the
          // document.  Without this, the suggestion's decoration
          // (an inline Decoration at the / or # position) must be
          // mapped through the document change, which can produce
          // an inconsistent DecorationGroup and crash with
          // "Cannot read properties of undefined (reading
          // 'localsInner')".  The Escape key handler in
          // @tiptap/suggestion follows the same pattern — it
          // dispatches an exit transaction before the view
          // processes anything else.
          exitSuggestion(editor.view, UNIFIED_SUGGESTION_KEY);
          if (trigger === "/") {
            const binding = props as BlockBinding;
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertContentAt(range.from, {
                type: binding.id,
                attrs: { content: binding.serialize(binding.defaultState) },
              })
              .run();
          } else if (trigger === "#") {
            const result = props as SearchResult;
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertContent([
                {
                  type: "reference",
                  attrs: { displayId: result.display_id },
                },
                { type: "text", text: " " },
              ])
              .run();
          }
        },

        // ── Allow filter ───────────────────────────────────────
        allow: ({ state, range }: { state: any; range: any }) => {
          const $from = state.doc.resolve(range.from);
          const parentType = $from.parent.type.name;

          // Derive the trigger character from the document text at
          // the match position rather than relying on the mutable
          // activeTrigger variable (which may be stale if a previous
          // session's exit collided with a new match attempt).
          const charBefore = range.from > 0
            ? state.doc.textBetween(range.from - 1, range.from)
            : "";
          const isHash = charBefore === "#";

          if (isHash) {
            return (
              parentType === "paragraph" ||
              parentType === "text" ||
              parentType === "tableCell"
            );
          }
          return parentType === "paragraph" || parentType === "text";
        },

        // ── Render (delegates to the appropriate dropdown) ─────
        render: () => {
          const mentionRenderer = mentionDropdownRenderer();
          let slashRenderer: ReactRenderer | null = null;

          const selectSlashBlock = (props: any, binding: BlockBinding) => {
            exitSuggestion(props.editor.view, UNIFIED_SUGGESTION_KEY);
            (props.editor as any)
              .chain()
              .focus()
              .deleteRange(props.range)
              .insertContentAt(props.range.from, {
                type: binding.id,
                attrs: { content: binding.serialize(binding.defaultState) },
              })
              .run();
          };

          return {
            onStart: (props: any) => {
              const trigger = activeTrigger;
              if (trigger === "/") {
                const rect = props.clientRect?.();
                slashRenderer = new ReactRenderer(BlockPopover, {
                  editor: props.editor,
                  props: {
                    editor: props.editor,
                    bindings: props.items as BlockBinding[],
                    initialQuery: props.query,
                    showSearch: false,
                    position: { top: (rect?.bottom ?? 0) + 4, left: rect?.left ?? 0 },
                    onClose: () => exitSuggestion(props.editor.view, UNIFIED_SUGGESTION_KEY),
                    onSelect: (binding: BlockBinding) => selectSlashBlock(props, binding),
                  },
                });
                document.body.appendChild(slashRenderer.element);
              }
              else if (trigger === "#") mentionRenderer.onStart(props);
            },
            onUpdate: (props: any) => {
              const trigger = activeTrigger;
              if (trigger === "/" && slashRenderer) {
                const rect = props.clientRect?.();
                slashRenderer.updateProps({
                  bindings: props.items,
                  initialQuery: props.query,
                  position: { top: (rect?.bottom ?? 0) + 4, left: rect?.left ?? 0 },
                  onSelect: (binding: BlockBinding) => selectSlashBlock(props, binding),
                });
              }
              else if (trigger === "#") mentionRenderer.onUpdate(props);
            },
            onKeyDown: (props: any): boolean => {
              const trigger = activeTrigger;
              if (trigger === "#")
                return mentionRenderer.onKeyDown(props);
              return false;
            },
            onExit: (props: any) => {
              // Clean up both popups — only one is visible, but both
              // need their DOM state reset.
              slashRenderer?.destroy();
              mentionRenderer.onExit(props);
              // Reset so a stale trigger doesn't leak into the next
              // suggestion session via allow / items / command.
              activeTrigger = null;
            },
          };
        },
      }),
    ];
  },
});

export default UnifiedSuggestion;
