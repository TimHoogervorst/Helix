/**
 * TipTap slash-command suggestion extension.
 *
 * - Triggers on "/".
 * - Shows available commands: Table (inserts a limsTable node).
 * - Arrow keys to navigate, Enter/Tab to select, Escape to dismiss.
 */
import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion, {
  type SuggestionProps,
  type SuggestionKeyDownProps,
} from "@tiptap/suggestion";

const SLASH_SUGGESTION_KEY = new PluginKey("slash-suggestion");

// ── Available commands ──────────────────────────────────────────────

interface SlashCommand {
  label: string;
  description: string;
  icon: string;
  action: (editor: any, range: { from: number; to: number }) => void;
}

function getCommands(): SlashCommand[] {
  return [
    {
      label: "Table",
      description: "Insert a schema-backed LIMS table",
      icon: "📊",
      action: (editor, range) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContentAt(range.from, [
            {
              type: "limsTable",
              attrs: {
                schemaId: null,
                title: "Table",
                columns: [
                  { name: "Column 1", type: "Text" },
                  { name: "Column 2", type: "Text" },
                ],
                rows: [
                  {
                    entityId: null,
                    displayId: "#1",
                    values: { "Column 1": "", "Column 2": "" },
                  },
                  {
                    entityId: null,
                    displayId: "#2",
                    values: { "Column 1": "", "Column 2": "" },
                  },
                ],
              },
            },
          ])
          .run();
      },
    },
  ];
}

// ── Dropdown renderer (raw DOM) ─────────────────────────────────────

interface CommandState {
  command: ((item: SlashCommand) => void) | null;
  commands: SlashCommand[];
  selectedIndex: number;
}

function dropdownRenderer() {
  let popup: HTMLDivElement | null = null;
  const state: CommandState = {
    command: null,
    commands: [],
    selectedIndex: 0,
  };

  function ensurePopup(): HTMLDivElement {
    if (!popup) {
      popup = document.createElement("div");
      popup.className = "slash-dropdown";
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
    onStart: (props: SuggestionProps<SlashCommand>) => {
      ensurePopup().style.display = "block";
      state.selectedIndex = 0;
      updatePosition(props.clientRect?.() ?? null, popup!);
    },

    onUpdate: (props: SuggestionProps<SlashCommand>) => {
      if (!popup) return;

      state.command = props.command;
      state.commands = props.items;

      updatePosition(props.clientRect?.() ?? null, popup);

      if (props.items.length === 0) {
        popup.innerHTML =
          '<div class="slash-dropdown-item is-empty">No commands matching "/"</div>';
        return;
      }

      popup.innerHTML = props.items
        .map(
          (item, i) =>
            `<div class="slash-dropdown-item${i === state.selectedIndex ? " is-selected" : ""}">
              <span class="slash-item-icon">${item.icon}</span>
              <div class="slash-item-body">
                <span class="slash-item-label">${item.label}</span>
                <span class="slash-item-desc">${item.description}</span>
              </div>
            </div>`
        )
        .join("");
    },

    onKeyDown: (props: SuggestionKeyDownProps) => {
      if (!popup) return false;

      const itemEls = popup.querySelectorAll(
        ".slash-dropdown-item:not(.is-empty)"
      );

      if (props.event.key === "ArrowDown") {
        state.selectedIndex = Math.min(
          state.selectedIndex + 1,
          itemEls.length - 1
        );
        itemEls.forEach((el, i) =>
          el.classList.toggle("is-selected", i === state.selectedIndex)
        );
        return true;
      }
      if (props.event.key === "ArrowUp") {
        state.selectedIndex = Math.max(state.selectedIndex - 1, 0);
        itemEls.forEach((el, i) =>
          el.classList.toggle("is-selected", i === state.selectedIndex)
        );
        return true;
      }
      if (props.event.key === "Enter" || props.event.key === "Tab") {
        if (state.command && state.commands[state.selectedIndex]) {
          state.command(state.commands[state.selectedIndex]);
          state.selectedIndex = 0;
          return true;
        }
      }
      if (props.event.key === "Escape") {
        if (popup) {
          popup.style.display = "none";
          popup.innerHTML = "";
        }
        state.selectedIndex = 0;
        state.command = null;
        state.commands = [];
        return true;
      }
      return false;
    },

    onExit: () => {
      if (popup) {
        popup.style.display = "none";
        popup.innerHTML = "";
      }
      state.selectedIndex = 0;
      state.command = null;
      state.commands = [];
    },
  };
}

// ── Fuse-style fuzzy filter ─────────────────────────────────────────

function fuzzyMatch(text: string, query: string): boolean {
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

// ── Extension ───────────────────────────────────────────────────────

const SlashCommands = Extension.create({
  name: "slashCommands",

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor as any,
        char: "/",
        pluginKey: SLASH_SUGGESTION_KEY,

        items: async ({ query }: { query: string }) => {
          const commands = getCommands();
          if (!query) return commands;
          return commands.filter((cmd) => {
            const target = `${cmd.label} ${cmd.description}`;
            return fuzzyMatch(target, query);
          });
        },

        command: ({
          editor,
          range,
          props,
        }: {
          editor: any;
          range: any;
          props: SlashCommand;
        }) => {
          props.action(editor, range);
        },

        allow: ({ state, range }: { state: any; range: any }) => {
          const $from = state.doc.resolve(range.from);
          // Only allow at the start of a paragraph or after a space
          const parentType = $from.parent.type.name;
          return parentType === "paragraph" || parentType === "text";
        },

        render: dropdownRenderer,
      }),
    ];
  },
});

export default SlashCommands;
export { SLASH_SUGGESTION_KEY };
