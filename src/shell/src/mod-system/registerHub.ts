import { ModRegistry } from "./ModRegistry";
import type { HubConfig } from "./types";

/**
 * Register a hub (browsing surface) with the mod system.
 * Automatically adds a sidebar nav item and a route.
 */
export function registerHub(config: HubConfig): void {
  ModRegistry.getInstance().registerHub(config);
}
