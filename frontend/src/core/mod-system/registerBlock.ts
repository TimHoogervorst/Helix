import { ModRegistry } from "./ModRegistry";
import type { BlockConfig } from "./types";

/**
 * Register a content block so that consumers (e.g., the ELN editor slash
 * menu) can discover and use it without importing directly from the owning mod.
 */
export function registerBlock(config: BlockConfig): void {
  ModRegistry.getInstance().registerBlock(config);
}
