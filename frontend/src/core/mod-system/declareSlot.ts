import { ModRegistry } from "./ModRegistry";
import type { SlotDeclaration } from "./types";

/**
 * Declare a named placeholder in a workspace.
 *
 * The slot's renderer owns how bound content is presented. Slots are
 * declared by the workspace host; mods bind blocks and buttons into them
 * via registerIntoSlot().
 */
export function declareSlot(config: SlotDeclaration): void {
  ModRegistry.getInstance().declareSlot(config);
}
