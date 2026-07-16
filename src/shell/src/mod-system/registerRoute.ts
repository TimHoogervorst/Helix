import { ModRegistry } from "./ModRegistry";
import type { RouteConfig } from "./types";

/**
 * Register a standalone route not tied to a hub or workspace.
 * Examples: /settings, /about.
 */
export function registerRoute(config: RouteConfig): void {
  ModRegistry.getInstance().registerRoute(config);
}
