/**
 * TipTap suggestion extension for ``#`` reference autocomplete.
 *
 * - Triggers on ``#``.
 * - Debounced (200ms) search against GET /api/references/search/?q=
 * - Tab/Enter selects the highlighted result.
 * - Space after ``#[A-Z]\\d+`` auto-converts to a reference node (even without dropdown).
 */
import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";
import { get } from "../../../../core/api/client";
import type { SearchResult } from "../../../../core/references/types";
import { createSuggestionDropdown } from "./suggestionDropdown";

const REFERENCE_SUGGESTION_KEY = new PluginKey("reference-suggestion");

/** Pattern: exact display ID match (e.g. "E1", "S42"). */
const DISPLAY_ID_PATTERN = /^[A-Z]\d+$/i;

export async function fetchItems(query: string): Promise<SearchResult[]> {
  if (!query) return [];
  try {
    const data = await get<{ results: SearchResult[] }>(
      `/references/search/?q=${encodeURIComponent(query)}`,
    );
    return data.results;
  } catch {
    return [];
  }
}

/**
 * Renders the dropdown via the shared factory.
 * Space-to-convert is wired through the ``onExtraKeyDown`` hook.
 */
function dropdownRenderer() {
  return createSuggestionDropdown<SearchResult>({
    popupClass: "reference-dropdown",
    emptyClass: "reference-dropdown-item is-empty",

    renderItem: (item, _i, _isSelected) =>
      `<span class="ref-dropdown-id">${item.display_id}</span>
       <span class="ref-dropdown-title">${item.title}</span>`,

    onExtraKeyDown: (props, state) => {
      if (props.event.key === " ") {
        if (DISPLAY_ID_PATTERN.test(state.query) && state.command) {
          // Use first search result, or synthesize one for unresolvable IDs
          const item: SearchResult =
            state.items.length > 0
              ? state.items[0]
              : {
                  display_id: state.query.toUpperCase(),
                  title: "",
                  type: "entry",
                  icon: "📄",
                };
          state.command(item);
          props.event.preventDefault();
          return true;
        }
        // Pattern doesn't match — let the suggestion handle the space normally
        return false;
      }
      return false;
    },
  })();
}

const ReferenceSuggestion = Extension.create({
  name: "referenceSuggestion",

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor as any,
        char: "#",
        pluginKey: REFERENCE_SUGGESTION_KEY,

        items: async ({ query }: { query: string }) => {
          return fetchItems(query);
        },

        command: ({
          editor,
          range,
          props,
        }: {
          editor: any;
          range: any;
          props: SearchResult;
        }) => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent([
              {
                type: "reference",
                attrs: { displayId: props.display_id },
              },
              { type: "text", text: " " },
            ])
            .run();
        },

        allow: ({ state, range }: { state: any; range: any }) => {
          const $from = state.doc.resolve(range.from);
          const parentType = $from.parent.type.name;
          return (
            parentType === "paragraph" ||
            parentType === "text" ||
            parentType === "tableCell"
          );
        },

        render: dropdownRenderer,
      }),
    ];
  },
});

export default ReferenceSuggestion;
