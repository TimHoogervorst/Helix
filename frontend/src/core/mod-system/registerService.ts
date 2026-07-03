import { ModRegistry } from "./ModRegistry";
import type { ServiceConfig } from "./types";

/**
 * Register a callable service for mod-to-mod communication.
 *
 * **Note:** Service invocation is not yet implemented.
 * This function stores the configuration shape so mods can declare
 * services, but `registry.call()` throws until the service registry
 * is wired.
 */
export function registerService(config: ServiceConfig): void {
  ModRegistry.getInstance().registerService(config);
}
