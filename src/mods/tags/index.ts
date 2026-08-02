import { lazy } from "react";
import { Tag } from "lucide-react";
import { Mod } from "../../shell/src/mod-system/Mod";
import type { ModManifest } from "../../shell/src/mod-system/types";
import manifest from "./modManifest.json";

const mod = new Mod(manifest as ModManifest);

// ── Settings: Tag management ──────────────────────────────────────────
mod.registerSettingsSection("manage", {
  label: "Labelling",
  icon: Tag,
  component: lazy(() => import("./settings/TagSettings")),
  order: 20,
});

/** No-op — all registrations happen at module scope via the Mod class. */
export function register() {}
