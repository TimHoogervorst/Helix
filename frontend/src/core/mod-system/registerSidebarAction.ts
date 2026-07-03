import { ModRegistry } from "./ModRegistry";
import type { SidebarActionConfig } from "./types";

/**
 * Register a button or badge on a workspace's sidebar row.
 * Examples: pin/unpin, star, share.
 */
export function registerSidebarAction(config: SidebarActionConfig): void {
  ModRegistry.getInstance().registerSidebarAction(config);
}
