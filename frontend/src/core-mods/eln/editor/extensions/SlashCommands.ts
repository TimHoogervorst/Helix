/**
 * TipTap slash-command suggestion extension.
 *
 * - Triggers on "/".
 * - Shows available commands from blocks registered via ``registerBlock()``.
 * - Arrow keys to navigate, Enter/Tab to select, Escape to dismiss.
 *
 * Blocks of type ``"tiptap-node"`` are auto-converted to slash commands:
 * the insert action is derived from the TipTap node name and optional
 * default attributes.
 */
import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";
import { createSuggestionDropdown } from "./suggestionDropdown";
import { ModRegistry, BLOCK_TYPE_TIPTAP_NODE, type TipTapBlockPayload } from "../../../../core/mod-system";

const SLASH_SUGGESTION_KEY = new PluginKey("slash-suggestion");

// ── Available commands ──────────────────────────────────────────────

export interface SlashCommand {
  label: string;
  description: string;
  icon: string;
  action: (editor: any, range: { from: number; to: number }) => void;
}

/**
 * Build the slash command list from registered blocks.
 *
 * Only blocks with ``type === "tiptap-node"`` are included.  The insert
 * action is auto-derived from the node name and optional default attrs,
 * so mods don't need to write TipTap chain boilerplate.
 *
 * Results are sorted alphabetically by label.
 */
export function getCommands(): SlashCommand[] {
  const blocks = ModRegistry.getInstance().getBlocks();
  const commands: SlashCommand[] = [];

  for (const block of blocks.values()) {
    if (block.type !== BLOCK_TYPE_TIPTAP_NODE) continue;

    const payload = block.payload as TipTapBlockPayload;
    const nodeName = payload.node.name;

    commands.push({
      label: block.label,
      description: block.description,
      icon: block.icon,
      action: (editor, range) => {
        const content: Record<string, unknown> = { type: nodeName };
        if (payload.defaultAttrs) {
          content.attrs = payload.defaultAttrs;
        }
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContentAt(range.from, content)
          .run();
      },
    });
  }

  // Sort alphabetically by label
  commands.sort((a, b) => a.label.localeCompare(b.label));

  return commands;
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
