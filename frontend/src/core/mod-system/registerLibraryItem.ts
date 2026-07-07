import { ModRegistry } from "./ModRegistry";
import type { LibraryItemConfig } from "./types";

/**
 * Register a library item type so that the Library hub can render
 * cards for that item type (e.g. ELN entries, folders).
 */
export function registerLibraryItem(config: LibraryItemConfig): void {
  ModRegistry.getInstance().registerLibraryItem(config);
}
