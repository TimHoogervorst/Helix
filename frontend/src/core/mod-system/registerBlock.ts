import { ModRegistry } from "./ModRegistry";
import type { BlockConfig, BlockRegistration } from "./types";

/**
 * Register a content block so that consumers (e.g., the ELN editor slash
 * menu) can discover and use it without importing directly from the owning mod.
 *
 * Accepts both the legacy BlockConfig shape (type-discriminated with `type` +
 * `payload`) and the new BlockRegistration shape (renderer-agnostic with
 * `component`, `serialize`, `deserialize`, etc.).
 *
 * The function discriminates based on the presence of `component` (new shape)
 * vs `type` (old shape).
 */
export function registerBlock(config: BlockConfig): void;
export function registerBlock(config: BlockRegistration): void;
export function registerBlock(config: BlockConfig | BlockRegistration): void {
  ModRegistry.getInstance().registerBlock(config);
}
