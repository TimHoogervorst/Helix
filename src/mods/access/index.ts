import { lazy } from "react";
import { Mod } from "../../shell/src/mod-system/Mod";
import type { ModManifest } from "../../shell/src/mod-system/types";
import manifest from "./modManifest.json";

const mod = new Mod(manifest as ModManifest);

mod.registerRoute("organization", {
  path: "/organization",
  component: lazy(() => import("./components/OrganizationPage")),
});

export function register() {}
