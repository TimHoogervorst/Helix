import { ModRegistry } from "./ModRegistry";

/**
 * Bind a block or button into an existing slot.
 *
 * The slot must be declared (via declareSlot()) before bindings target it.
 * The target (block or button) must be registered and must match the slot's
 * `accepts` type. Validation runs during ModRegistry.validate() at boot.
 *
 * @param slotId   - The slot to bind into, e.g. "eln.editor".
 * @param targetId - The block or button ID to bind, e.g. "eln.table".
 * @param overrides - Per-binding overrides merged with slot defaults (binding wins per-key).
 * @param order     - Position within the slot. Lower = earlier (leftmost/topmost).
 */
export function registerIntoSlot(
  slotId: string,
  targetId: string,
  overrides?: Record<string, unknown>,
  order?: number,
): void {
  ModRegistry.getInstance().registerIntoSlot(
    slotId,
    targetId,
    overrides,
    order,
  );
}
