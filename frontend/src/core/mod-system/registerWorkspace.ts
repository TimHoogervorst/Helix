import { ModRegistry } from "./ModRegistry";
import type { WorkspaceConfig } from "./types";

/**
 * Register a workspace type that can appear in consoles.
 * Tied to one or more consoles via `consoleIds`.
 * The `route` field auto-registers a standalone page route.
 */
export function registerWorkspace(config: WorkspaceConfig): void {
  ModRegistry.getInstance().registerWorkspace(config);
}
