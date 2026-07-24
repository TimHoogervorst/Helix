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
import { PluginKey } from "@tiptap/pm/state";
import Suggestion, { findSuggestionMatch } from "@tiptap/suggestion";
import type {
  Trigger,
  SuggestionMatch,
} from "@tiptap/suggestion";
import { createSuggestionDropdown } from "./suggestionDropdown";
import { ModRegistry } from "../../../../shell/src/mod-system";
import { get } from "../../../../shell/src/api/client";
import type { SearchResult } from "../../../../shell/src/mentions/types";

const UNIFIED_SUGGESTION_KEY = new PluginKey("unified-suggestion");

/** Pattern: exact display ID match (e.g. "E1", "S42"). */
const DISPLAY_ID_PATTERN = /^[A-Z]\d+$/i;

// ── Types ────────────────────────────────────────────────────────────

interface SlashCommand {
  label: string;
  description: string;
  icon: string;
  action: (editor: any, range: { from: number; to: number }) => void;
}

// ── Slash-command helpers (extracted from SlashCommands.ts) ─────────

function getCommands(): SlashCommand[] {
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

function fuzzyMatch(text: string, query: string): boolean {
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

// ── Mention-search helper (extracted from MentionSuggestion.ts) ──────

async function fetchItems(query: string): Promise<SearchResult[]> {
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

function slashDropdownRenderer() {
  return createSuggestionDropdown<SlashCommand>({
    popupClass: "slash-dropdown",
    emptyClass: "slash-dropdown-item is-empty",

    renderItem: (item, _i, _isSelected) =>
      `<span class="slash-item-icon">${item.icon}</span>
       <div class="slash-item-body">
         <span class="slash-item-label">${item.label}</span>
         <span class="slash-item-desc">${item.description}</span>
       </div>`,

    onExtraKeyDown: (props, state) => {
      if (
        props.event.key === "Tab" &&
        state.command &&
        state.items[state.selectedIndex]
      ) {
        state.command(state.items[state.selectedIndex]);
        return true;
      }
      return false;
    },
  })();
}

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
          if (activeTrigger === "/") {
            const commands = getCommands();
            if (!query) return commands;
            return commands.filter((cmd) =>
              fuzzyMatch(`${cmd.label} ${cmd.description}`, query),
            );
          }
          if (activeTrigger === "#") {
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
          if (activeTrigger === "/") {
            (props as SlashCommand).action(editor, range);
          } else if (activeTrigger === "#") {
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
          // # mentions are also allowed inside table cells
          if (activeTrigger === "#") {
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
          const slashRenderer = slashDropdownRenderer();
          const mentionRenderer = mentionDropdownRenderer();

          return {
            onStart: (props: any) => {
              if (activeTrigger === "/") slashRenderer.onStart(props);
              else if (activeTrigger === "#") mentionRenderer.onStart(props);
            },
            onUpdate: (props: any) => {
              if (activeTrigger === "/") slashRenderer.onUpdate(props);
              else if (activeTrigger === "#") mentionRenderer.onUpdate(props);
            },
            onKeyDown: (props: any): boolean => {
              if (activeTrigger === "/") return slashRenderer.onKeyDown(props);
              if (activeTrigger === "#")
                return mentionRenderer.onKeyDown(props);
              return false;
            },
            onExit: (props: any) => {
              // Clean up both popups — only one is visible, but both
              // need their DOM state reset.
              slashRenderer.onExit(props);
              mentionRenderer.onExit(props);
            },
          };
        },
      }),
    ];
  },
});

export default UnifiedSuggestion;
