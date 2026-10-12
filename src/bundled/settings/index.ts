import { Cog } from "lucide-react";
import type { Mod } from "@helix/mod-api";
import SettingsPage from "./pages/SettingsPage";
import DevToolsSettings from "./DevToolsSettings";
import ModLifecycleSettings from "./ModLifecycleSettings";

// ── Route: /settings shell with sidebar-nav layout ─────────────────────
export function register(mod: Mod) {
  mod.registerRoute("page", {
  path: "/settings",
  component: SettingsPage,
  });

  mod.registerSettingsSection("dev-tools", {
  label: "Developer tools",
  icon: Cog,
  component: DevToolsSettings,
  order: 50,
  });
  mod.registerSettingsSection("external-mods", {
    label: "External Mods",
    icon: Cog,
    component: ModLifecycleSettings,
    order: 40,
  });
}

