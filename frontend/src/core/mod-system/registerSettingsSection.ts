import { ModRegistry } from "./ModRegistry";
import type { SettingsSectionConfig } from "./types";

/**
 * Register a settings panel in the Settings shell.
 * The Settings mod owns the shell; other mods register sections into it.
 */
export function registerSettingsSection(config: SettingsSectionConfig): void {
  ModRegistry.getInstance().registerSettingsSection(config);
}
