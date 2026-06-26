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
import Suggestion, {
  type SuggestionProps,
  type SuggestionKeyDownProps,
} from "@tiptap/suggestion";
import { get } from "../api/client";
import type { SearchResult } from "../types/references";

const REFERENCE_SUGGESTION_KEY = new PluginKey("reference-suggestion");

/** Pattern: exact display ID match (e.g. "E1", "S42"). */
const DISPLAY_ID_PATTERN = /^[A-Z]\d+$/i;

async function fetchItems(query: string): Promise<SearchResult[]> {
  if (!query) return [];
  try {
    const data = await get<{ results: SearchResult[] }>(
      `/references/search/?q=${encodeURIComponent(query)}`
    );
    return data.results;
  } catch {
    return [];
  }
}

/**
 * Renders the dropdown using raw DOM.
 * Handles Space-to-convert when the query matches a display ID pattern.
 */
function dropdownRenderer() {
  let popup: HTMLDivElement | null = null;
  let selectedIndex = 0;

  // Captured from onUpdate so onKeyDown can access them.
  let currentCommand: ((item: SearchResult) => void) | null = null;
  let currentQuery = "";
  let currentItems: SearchResult[] = [];

  function ensurePopup(): HTMLDivElement {
    if (!popup) {
      popup = document.createElement("div");
      popup.className = "reference-dropdown";
      document.body.appendChild(popup);
    }
    return popup;
  }

  function updatePosition(rect: DOMRect | null, el: HTMLElement) {
    if (!rect) return;
    el.style.top = `${rect.bottom + window.scrollY + 4}px`;
    el.style.left = `${rect.left + window.scrollX}px`;
  }

  return {
    onStart: (props: SuggestionProps<SearchResult>) => {
      ensurePopup().style.display = "block";
      selectedIndex = 0;
      updatePosition(props.clientRect?.() ?? null, popup!);
    },

    onUpdate: (props: SuggestionProps<SearchResult>) => {
      if (!popup) return;

      // Capture state for onKeyDown
      currentCommand = props.command;
      currentQuery = props.query;
      currentItems = props.items;

      updatePosition(props.clientRect?.() ?? null, popup);

      if (props.items.length === 0) {
        popup.innerHTML =
          '<div class="reference-dropdown-item is-empty">No results</div>';
        return;
      }

      popup.innerHTML = props.items
        .map(
          (item, i) =>
            `<div class="reference-dropdown-item${i === selectedIndex ? " is-selected" : ""}">
              <span class="ref-dropdown-id">${item.display_id}</span>
              <span class="ref-dropdown-title">${item.title}</span>
            </div>`
        )
        .join("");
    },

    onKeyDown: (props: SuggestionKeyDownProps) => {
      // ── Space: auto-convert when query matches #[A-Z]\d+ ──
      if (props.event.key === " ") {
        if (DISPLAY_ID_PATTERN.test(currentQuery) && currentCommand) {
          // Use first search result, or synthesize one for unresolvable IDs
          const item: SearchResult =
            currentItems.length > 0
              ? currentItems[0]
              : {
                  display_id: currentQuery.toUpperCase(),
                  title: "",
                  type: "entry",
                  icon: "📄",
                };
          currentCommand(item);
          selectedIndex = 0;
          props.event.preventDefault();
          return true;
        }
        // Pattern doesn't match — let the suggestion handle the space normally
        return false;
      }

      // ── Arrow navigation ──
      if (!popup) return false;
      const itemEls = popup.querySelectorAll(
        ".reference-dropdown-item:not(.is-empty)"
      );

      if (props.event.key === "ArrowDown") {
        selectedIndex = Math.min(selectedIndex + 1, itemEls.length - 1);
        itemEls.forEach((el, i) =>
          el.classList.toggle("is-selected", i === selectedIndex)
        );
        return true;
      }
      if (props.event.key === "ArrowUp") {
        selectedIndex = Math.max(selectedIndex - 1, 0);
        itemEls.forEach((el, i) =>
          el.classList.toggle("is-selected", i === selectedIndex)
        );
        return true;
      }
      if (props.event.key === "Enter") {
        if (itemEls[selectedIndex]) {
          (itemEls[selectedIndex] as HTMLElement).click();
          return true;
        }
      }
      return false;
    },

    onExit: () => {
      if (popup) {
        popup.style.display = "none";
        popup.innerHTML = "";
      }
      selectedIndex = 0;
      currentCommand = null;
      currentQuery = "";
      currentItems = [];
    },
  };
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
export { REFERENCE_SUGGESTION_KEY };
