import { Cog } from "lucide-react";
import { Mod } from "../../shell/src/mod-system/Mod";
import type { ModManifest } from "../../shell/src/mod-system/types";
import SettingsPage from "./pages/SettingsPage";
import DevToolsSettings from "./DevToolsSettings";
import manifest from "./modManifest.json";

const mod = new Mod(manifest as ModManifest);

// ── Route: /settings shell with sidebar-nav layout ─────────────────────
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

/** No-op — all registrations happen at module scope via the Mod class. */
export function register() {}
