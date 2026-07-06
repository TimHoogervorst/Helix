import { ModRegistry } from "./ModRegistry";
import type { RouteConfig } from "./types";

/**
 * Register a route that renders *outside* the Layout shell (no sidebar).
 *
 * Use this for login, register, and other full-page routes that should
 * not show the app chrome.
 */
export function registerPublicRoute(config: Omit<RouteConfig, "public">): void {
  ModRegistry.getInstance().registerRoute({ ...config, public: true });
}
