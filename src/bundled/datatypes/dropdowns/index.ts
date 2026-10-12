import { lazy } from "react";
import { List } from "lucide-react";
import type { Mod } from "@helix/mod-api";

// ── Settings: Dropdown management ────────────────────────────────────
export function register(mod: Mod) {
  mod.registerSettingsSection("manage", {
  label: "Dropdowns",
  icon: List,
  component: lazy(() => import("./settings/DropdownSettings")),
  order: 30,
  });
}

