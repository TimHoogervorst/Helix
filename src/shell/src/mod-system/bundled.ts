import type { ModModule } from "./ModLoader";

import * as accessModule from "../../../bundled/access/access";
import accessManifest from "../../../bundled/access/access/modManifest.json";
import * as usersModule from "../../../bundled/access/users";
import usersManifest from "../../../bundled/access/users/modManifest.json";
import * as dropdownsModule from "../../../bundled/datatypes/dropdowns";
import dropdownsManifest from "../../../bundled/datatypes/dropdowns/modManifest.json";
import * as tagsModule from "../../../bundled/labelling/tags";
import tagsManifest from "../../../bundled/labelling/tags/modManifest.json";
import * as limsModule from "../../../bundled/lims";
import limsManifest from "../../../bundled/lims/modManifest.json";
import * as settingsModule from "../../../bundled/settings";
import settingsManifest from "../../../bundled/settings/modManifest.json";
import * as entitiesModule from "../../../bundled/shared/entities";
import entitiesManifest from "../../../bundled/shared/entities/modManifest.json";
import * as homeModule from "../../../bundled/shared/home";
import homeManifest from "../../../bundled/shared/home/modManifest.json";
import * as libraryModule from "../../../bundled/shared/library";
import libraryManifest from "../../../bundled/shared/library/modManifest.json";
import * as tabsModule from "../../../bundled/tabs";
import tabsManifest from "../../../bundled/tabs/modManifest.json";

// Bundled mods are closed and loaded by explicit imports; external mods stay
// discoverable through the Vite glob in ModLoader.
export const bundledModModules: Record<string, ModModule> = {
  "../../../bundled/access/access/index.ts": accessModule as ModModule,
  "../../../bundled/access/users/index.ts": usersModule as ModModule,
  "../../../bundled/datatypes/dropdowns/index.ts": dropdownsModule as ModModule,
  "../../../bundled/labelling/tags/index.ts": tagsModule as ModModule,
  "../../../bundled/lims/index.ts": limsModule as ModModule,
  "../../../bundled/settings/index.ts": settingsModule as ModModule,
  "../../../bundled/shared/entities/index.ts": entitiesModule as ModModule,
  "../../../bundled/shared/home/index.ts": homeModule as ModModule,
  "../../../bundled/shared/library/index.ts": libraryModule as ModModule,
  "../../../bundled/tabs/index.ts": tabsModule as ModModule,
};
export const bundledJsonManifestModules: Record<
  string,
  { default: Record<string, unknown> }
> = {
  "../../../bundled/access/access/modManifest.json": { default: accessManifest },
  "../../../bundled/access/users/modManifest.json": { default: usersManifest },
  "../../../bundled/datatypes/dropdowns/modManifest.json": {
    default: dropdownsManifest,
  },
  "../../../bundled/labelling/tags/modManifest.json": { default: tagsManifest },
  "../../../bundled/lims/modManifest.json": { default: limsManifest },
  "../../../bundled/settings/modManifest.json": { default: settingsManifest },
  "../../../bundled/shared/entities/modManifest.json": { default: entitiesManifest },
  "../../../bundled/shared/home/modManifest.json": { default: homeManifest },
  "../../../bundled/shared/library/modManifest.json": {
    default: libraryManifest,
  },
  "../../../bundled/tabs/modManifest.json": { default: tabsManifest },
};
