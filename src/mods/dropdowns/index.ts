import { lazy } from "react";
import { List } from "lucide-react";
import { Mod } from "../../shell/src/mod-system/Mod";
import type { ModManifest } from "../../shell/src/mod-system/types";
import manifest from "./modManifest.json";

const mod = new Mod(manifest as ModManifest);

// ── Settings: Dropdown management ────────────────────────────────────
mod.registerSettingsSection("manage", {
  label: "Dropdowns",
  icon: List,
  component: lazy(() => import("./settings/DropdownSettings")),
  order: 30,
});

/** No-op — all registrations happen at module scope via the Mod class. */
export function register() {}
