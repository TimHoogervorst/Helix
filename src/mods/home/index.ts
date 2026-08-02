import { House } from "lucide-react";
import { Mod } from "../../shell/src/mod-system/Mod";
import type { ModManifest } from "../../shell/src/mod-system/types";
import HomePage from "./HomePage";
import manifest from "./modManifest.json";

const mod = new Mod(manifest as ModManifest);

mod.registerHub("home", {
  label: "Home",
  icon: House,
  route: "/home",
  component: HomePage,
  order: 0,
  description: "Your lab dashboard — greeting, activity feed, and quick navigation to all hubs.",
});

/** No-op — all registrations happen at module scope via the Mod class. */
export function register() {}
