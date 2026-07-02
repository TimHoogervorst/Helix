import { ModRegistry } from "./ModRegistry";
import type { SlashCommandConfig } from "./types";

/**
 * Register a `/` command for the ELN editor's slash menu.
 *
 * **Note:** Slash command execution is not yet implemented.
 * This function stores the configuration shape so mods can declare
 * commands, but they will not appear in the editor until the slash
 * command system is wired.
 */
export function registerSlashCommand(config: SlashCommandConfig): void {
  ModRegistry.getInstance().registerSlashCommand(config);
}
