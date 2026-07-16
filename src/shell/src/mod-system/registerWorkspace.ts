import { ModRegistry } from "./ModRegistry";
import type { WorkspaceConfig } from "./types";

/**
 * Register a workspace with the mod system.
 *
 * Each mod that provides a workspace surface (entity workspace, notebook, etc.)
 * calls this during its `register()` function. The workspace `id` doubles as
 * the URL namespace: `/{workspaceId}/{displayId}`.
 */
export function registerWorkspace(config: WorkspaceConfig): void {
  ModRegistry.getInstance().registerWorkspace(config);
}
