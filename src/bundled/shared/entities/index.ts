import { Microscope } from "lucide-react";
import type { Mod } from "@helix/mod-api";
import EntitiesHub from "./hub/EntitiesHub";

// The shared Entities mod owns the cross-workspace hub and therefore its route.
export function register(mod: Mod) {
  mod.registerHub("entities", {
  label: "Entities",
  icon: Microscope,
  route: "/entities",
  component: EntitiesHub,
  order: 20,
  description: "Browse, search, and filter all entities across every workspace.",
  });
}

