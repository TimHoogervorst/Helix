/**
 * Shared suggestion-dropdown factory for TipTap extensions.
 *
 * Two now-deleted standalone TipTap extensions each implemented a
 * ~120-line raw-DOM dropdown with identical lifecycle and interaction
 * patterns — those have been superseded by the unified suggestion
 * extension.  This factory extracts the shared machinery so
 * that each extension only provides item rendering and optional extra
 * key handlers.
 *
 * Usage::
 *
 *     import { createSuggestionDropdown } from "./suggestionDropdown";
 *
 *     function dropdownRenderer() {
 *       return createSuggestionDropdown<MyItem>({
 *         popupClass: "my-dropdown",
 *         emptyClass: "my-dropdown-item is-empty",
 *         renderItem: (item, i, isSelected) =>
 *           `<div class="${isSelected ? "selected" : ""}">${item.label}</div>`,
 *         onExtraKeyDown: (props, state) => {
 *           // Return true if handled, false to fall through to defaults.
 *           return false;
 *         },
 *       })();
 *     }
 */

import type {
  SuggestionProps,
  SuggestionKeyDownProps,
} from "@tiptap/suggestion";

// ── Options passed by each extension ─────────────────────────────────

export interface SuggestionDropdownOptions<T> {
  /** CSS class for the popup container element. */
  popupClass: string;

  /** CSS class for the "no results" item. */
  emptyClass: string;

  /** Render a single item as an HTML string. Receives index for selection marking. */
  renderItem: (item: T, index: number, isSelected: boolean) => string;

  /**
   * Optional extra key handlers. Called before the default handlers.
   * Return `true` if handled, `false` to fall through to defaults.
   */
  onExtraKeyDown?: (
    props: SuggestionKeyDownProps,
    state: {
      selectedIndex: number;
      items: T[];
      command: ((item: T) => void) | null;
      query: string;
    },
  ) => boolean;
}

// ── Internal state shape ─────────────────────────────────────────────

interface DropdownState<T> {
  popup: HTMLDivElement | null;
  selectedIndex: number;
  command: ((item: T) => void) | null;
  query: string;
  items: T[];
}

// ── Return type — matches what TipTapʼs ``render`` expects ───────────

export interface SuggestionDropdownInstance {
  onStart: (props: SuggestionProps<any>) => void;
  onUpdate: (props: SuggestionProps<any>) => void;
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
  onExit: () => void;
}

// ── Factory ──────────────────────────────────────────────────────────

/**
 * Create a suggestion dropdown renderer for a TipTap Suggestion extension.
 *
 * The returned function (when called) produces an object with the
 * ``onStart`` / ``onUpdate`` / ``onKeyDown`` / ``onExit`` methods that
 * TipTapʼs ``render`` option expects.  The factory handles popup
 * lifecycle, positioning, arrow-key navigation, Enter/Escape, and
 * selection styling.  Each extension provides its own item rendering
 * and optional extra key handlers via ``options``.
 */
export function createSuggestionDropdown<T>(
  options: SuggestionDropdownOptions<T>,
): () => SuggestionDropdownInstance {
  const { popupClass, emptyClass, renderItem, onExtraKeyDown } = options;

  function createRenderer(): SuggestionDropdownInstance {
    const state: DropdownState<T> = {
      popup: null,
      selectedIndex: 0,
      command: null,
      query: "",
      items: [],
    };

    // ── Popup DOM ──────────────────────────────────────────────

    function ensurePopup(): HTMLDivElement {
      if (!state.popup) {
        state.popup = document.createElement("div");
        state.popup.className = popupClass;
        document.body.appendChild(state.popup);
      }
      return state.popup;
    }

    function updatePosition(rect: DOMRect | null, el: HTMLElement) {
      if (!rect) return;
      el.style.top = `${rect.bottom + window.scrollY + 4}px`;
      el.style.left = `${rect.left + window.scrollX}px`;
    }

    // ── Selection UI ───────────────────────────────────────────

    function getItemElements(popup: HTMLDivElement): HTMLElement[] {
      return Array.from(
        popup.querySelectorAll<HTMLElement>(
          `[data-dropdown-item]:not(.${emptyClass})`,
        ),
      );
    }

    function toggleSelection(itemEls: HTMLElement[]) {
      itemEls.forEach((el, i) =>
        el.classList.toggle("is-selected", i === state.selectedIndex),
      );
    }

    // ── Public API ─────────────────────────────────────────────

    return {
      onStart: (props: SuggestionProps<T>) => {
        ensurePopup().style.display = "block";
        state.selectedIndex = 0;
        updatePosition(props.clientRect?.() ?? null, state.popup!);
      },

      onUpdate: (props: SuggestionProps<T>) => {
        const popup = state.popup;
        if (!popup) return;

        // Capture state for onKeyDown
        state.command = props.command;
        state.query = props.query;
        state.items = props.items;

        updatePosition(props.clientRect?.() ?? null, popup);

        if (props.items.length === 0) {
          popup.innerHTML = `<div class="${emptyClass}">No results</div>`;
          return;
        }

        popup.innerHTML = props.items
          .map(
            (item, i) =>
              `<div class="${popupClass}-item${i === state.selectedIndex ? " is-selected" : ""}" data-dropdown-item="">${renderItem(
                item,
                i,
                i === state.selectedIndex,
              )}</div>`,
          )
          .join("");
      },

      onKeyDown: (props: SuggestionKeyDownProps): boolean => {
        // ── Extra key handlers (extension-specific) ─────────
        if (onExtraKeyDown) {
          const handled = onExtraKeyDown(props, {
            selectedIndex: state.selectedIndex,
            items: state.items,
            command: state.command,
            query: state.query,
          });
          if (handled) return true;
        }

        // ── Default handlers ─────────────────────────────────
        const popup = state.popup;
        if (!popup) return false;

        const itemEls = getItemElements(popup);

        if (props.event.key === "ArrowDown") {
          if (itemEls.length > 0) {
            state.selectedIndex = Math.min(
              state.selectedIndex + 1,
              itemEls.length - 1,
            );
            toggleSelection(itemEls);
          }
          return true;
        }

        if (props.event.key === "ArrowUp") {
          if (itemEls.length > 0) {
            state.selectedIndex = Math.max(state.selectedIndex - 1, 0);
            toggleSelection(itemEls);
          }
          return true;
        }

        if (props.event.key === "Enter") {
          if (
            itemEls.length > 0 &&
            state.command &&
            state.items[state.selectedIndex]
          ) {
            state.command(state.items[state.selectedIndex]);
            return true;
          }
          return false;
        }

        if (props.event.key === "Escape") {
          if (popup) {
            popup.style.display = "none";
            popup.innerHTML = "";
          }
          state.selectedIndex = 0;
          state.command = null;
          state.query = "";
          state.items = [];
          return true;
        }

        return false;
      },

      onExit: () => {
        if (state.popup) {
          state.popup.style.display = "none";
          state.popup.innerHTML = "";
        }
        state.selectedIndex = 0;
        state.command = null;
        state.query = "";
        state.items = [];
      },
    };
  }

  return createRenderer;
}
