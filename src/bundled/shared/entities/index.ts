import { Microscope } from "lucide-react";
import { Mod } from "../../../shell/src/mod-system/Mod";
import type { ModManifest } from "../../../shell/src/mod-system/types";
import EntitiesHub from "./hub/EntitiesHub";
import manifest from "./modManifest.json";

const mod = new Mod(manifest as ModManifest);

// The shared Entities mod owns the cross-workspace hub and therefore its route.
mod.registerHub("entities", {
  label: "Entities",
  icon: Microscope,
  route: "/entities",
  component: EntitiesHub,
  order: 20,
  description: "Browse, search, and filter all entities across every workspace.",
});

export function register() {}
