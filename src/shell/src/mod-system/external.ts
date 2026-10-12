import elnManifest from "@helix/eln/manifest";
import type { ModModule } from "./ModLoader";

/** External packages are composed through npm, never by scanning repo paths. */
export const externalModLoaders: Record<
  string,
  () => Promise<ModModule>
> = {
  "@helix/eln": async () => (await import("@helix/eln")) as ModModule,
};

export const externalJsonManifestModules: Record<
  string,
  { default: Record<string, unknown> }
> = {
  "@helix/eln/manifest": { default: elnManifest },
};
