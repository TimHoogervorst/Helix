import { lazy } from "react";
import { Tag } from "lucide-react";
import type { Mod } from "@helix/mod-api";

// ── Settings: Tag management ──────────────────────────────────────────
export function register(mod: Mod) {
  mod.registerSettingsSection("manage", {
  label: "Labelling",
  icon: Tag,
  component: lazy(() => import("./settings/TagSettings")),
  order: 20,
  });
}

