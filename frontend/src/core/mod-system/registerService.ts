import { ModRegistry } from "./ModRegistry";
import type { ServiceConfig } from "./types";

/**
 * Register a callable service for mod-to-mod communication.
 *
 * Mods call this in their `register()` function to expose a service
 * handler. Other mods invoke it via `registry.call(serviceId, ...args)`.
 */
export function registerService(config: ServiceConfig): void {
  ModRegistry.getInstance().registerService(config);
}
