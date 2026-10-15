import type { ModModule } from "./ModLoader";

/**
 * External packages are composed through installed package metadata. Vite
 * expands these globs at build time, so validation and discovery never call a
 * Mod's registration function just to inspect its manifest.
 */
const manifestModules = import.meta.glob<{ default: Record<string, unknown> }>(
  ["../../../mods/*/modManifest.json", "../../../../node_modules/**/modManifest.json"],
  { eager: true },
);

const frontendModules = import.meta.glob<ModModule>(
  [
    "../../../mods/*/index.ts",
    "../../../../node_modules/**/index.ts",
    "../../../../node_modules/**/dist/index.js",
  ],
  { eager: false },
);

export const externalModLoaders: Record<
  string,
  () => Promise<ModModule>
> = frontendModules;

export const externalJsonManifestModules: Record<
  string,
  { default: Record<string, unknown> }
> = manifestModules;
