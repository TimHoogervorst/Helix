import { ModRegistry } from "./ModRegistry";
import type { ConsoleConfig } from "./types";

/**
 * Register a browsing surface (console) with the mod system.
 * Automatically adds a sidebar nav item.
 */
export function registerConsole(config: ConsoleConfig): void {
  ModRegistry.getInstance().registerConsole(config);
}
