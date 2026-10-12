import type { ModModule } from "./ModLoader";

// Bundled mods are closed and added here by explicit import in later moves.
export const bundledModModules: Record<string, ModModule> = {};
export const bundledJsonManifestModules: Record<
  string,
  { default: Record<string, unknown> }
> = {};
