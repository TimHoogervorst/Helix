import { lazy } from "react";
import { Users, FolderKanban } from "lucide-react";
import { Mod } from "../../shell/src/mod-system/Mod";
import type { ModManifest } from "../../shell/src/mod-system/types";
import manifest from "./modManifest.json";

const mod = new Mod(manifest as ModManifest);

mod.registerRoute("organization", {
  path: "/organization",
  component: lazy(() => import("./components/OrganizationPage")),
});

mod.registerSettingsSection("teams", {
  label: "Teams",
  icon: Users,
  component: lazy(() => import("./settings/TeamsManagement")),
  order: 10,
});

mod.registerSettingsSection("projects", {
  label: "Projects",
  icon: FolderKanban,
  component: lazy(() => import("./settings/ProjectsManagement")),
  order: 12,
});

export function register() {}
