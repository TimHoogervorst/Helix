import { Wrench } from "lucide-react";
import { Mod } from "../../shell/src/mod-system/Mod";
import type { ModManifest } from "../../shell/src/mod-system/types";
import TablesPlayground from "./playground/TablesPlayground";
import DevToolsSettings from "./settings/DevToolsSettings";
import manifest from "./modManifest.json";

const mod = new Mod(manifest as ModManifest);

mod.registerSettingsSection("dev-tools", {
  label: "Developer tools",
  icon: Wrench,
  component: DevToolsSettings,
  order: 50,
});

if (import.meta.env.DEV) {
  mod.registerRoute("tables-playground", {
    path: "/dev/tables",
    component: TablesPlayground,
  });
}

export function register() {}
