/**
 * TipTap slash-command suggestion extension.
 *
 * - Triggers on "/".
 * - Shows available commands: Table (inserts a limsTable node).
 * - Arrow keys to navigate, Enter/Tab to select, Escape to dismiss.
 */
import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";
import { createSuggestionDropdown } from "./suggestionDropdown";

const SLASH_SUGGESTION_KEY = new PluginKey("slash-suggestion");

// ── Available commands ──────────────────────────────────────────────

export interface SlashCommand {
  label: string;
  description: string;
  icon: string;
  action: (editor: any, range: { from: number; to: number }) => void;
}

export function getCommands(): SlashCommand[] {
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

// ── Dropdown renderer (via shared factory) ─────────────────────────────

function dropdownRenderer() {
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

// ── Fuse-style fuzzy filter ─────────────────────────────────────────

export function fuzzyMatch(text: string, query: string): boolean {
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
