import { ModRegistry } from "./ModRegistry";
import type { ButtonRegistration } from "./types";

/**
 * Register a simple fire-only button for toolbar and button-group slots.
 *
 * Buttons emit events via the workspace bus (`bus.collect()`, `bus.emit()`,
 * `bus.request()`) but never listen. If a UI element needs to both listen
 * and fire, use registerBlock() instead.
 */
export function registerButton(config: ButtonRegistration): void {
  ModRegistry.getInstance().registerButton(config);
}
