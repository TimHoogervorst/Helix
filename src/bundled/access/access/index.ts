import { lazy } from "react";
import { Users, FolderKanban } from "lucide-react";
import type { Mod } from "@helix/mod-api";

export function register(mod: Mod) {
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
}

