import { ModRegistry } from "./ModRegistry";
import type { BlockRegistration } from "./types";

/**
 * Register a renderer-agnostic content block.
 *
 * Blocks registered here are discoverable by the slot system and can be
 * bound into any slot via {@link registerIntoSlot}. The slot's renderer
 * determines how the block is presented — the same block can render in an
 * editor (as a TipTap node), a sidebar (as a panel), or a tab without the
 * block author writing any rendering-mode-specific code.
 */
export function registerBlock(config: BlockRegistration): void {
  ModRegistry.getInstance().registerBlock(config);
}
